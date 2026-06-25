const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>WebRTC Server</title></head>
      <body style="background:#0a0a1a;color:#fff;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;">
        <div>
          <h1 style="background:linear-gradient(135deg,#ff3b3b,#ff7c1e);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">🎤 WebRTC Server</h1>
          <p style="color:#00ff88;">✅ Servidor rodando!</p>
          <p style="color:#666;font-size:12px;">Socket.IO ativo</p>
          <p style="color:#666;font-size:12px;">Domínio: positive-forgiveness-production-de45.up.railway.app</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    salas: Object.keys(salas).length,
    usuarios: Object.values(salas).reduce((acc, sala) => acc + Object.keys(sala.users).length, 0)
  });
});

const salas = {};

io.on('connection', (socket) => {
  console.log('🟢 Conectado:', socket.id);
  socket.emit('conectado', { status: 'ok', id: socket.id });

  socket.on('entrar_sala', (data) => {
    const room = `batalha_${data.desafio_id}`;
    socket.join(room);
    socket.room = room;
    socket.user = data;
    
    if (!salas[room]) salas[room] = { users: {}, offer: null, offerFrom: null };
    salas[room].users[socket.id] = data;
    
    const usuarios = Object.values(salas[room].users);
    socket.emit('usuarios_na_sala', usuarios);
    socket.to(room).emit('usuario_entrou', data);
    
    console.log(`📥 ${data.nome} entrou na sala ${room}`);
    console.log(`👥 ${usuarios.length} usuários na sala`);
  });

  socket.on('webrtc_offer', (data) => {
    const room = socket.room;
    if (room && salas[room]) {
      salas[room].offer = data.offer;
      salas[room].offerFrom = socket.id;
      socket.to(room).emit('webrtc_offer_received', {
        offer: data.offer,
        from_id: socket.id,
        from_nome: socket.user?.nome || 'Desconhecido'
      });
      console.log(`📤 Offer enviado na sala ${room}`);
    }
  });

  socket.on('webrtc_answer', (data) => {
    const room = socket.room;
    if (room && salas[room]) {
      socket.to(room).emit('webrtc_answer_received', {
        answer: data.answer,
        from_id: socket.id,
        from_nome: socket.user?.nome || 'Desconhecido'
      });
      console.log(`📥 Answer enviado na sala ${room}`);
    }
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const room = socket.room;
    if (room) {
      socket.to(room).emit('webrtc_ice_candidate_received', {
        candidate: data.candidate,
        from_id: socket.id
      });
    }
  });

  socket.on('get_offer', () => {
    const room = socket.room;
    if (room && salas[room] && salas[room].offer) {
      socket.emit('offer_received', {
        offer: salas[room].offer,
        from_id: salas[room].offerFrom
      });
    }
  });

  socket.on('disconnect', () => {
    const room = socket.room;
    if (room && salas[room]) {
      delete salas[room].users[socket.id];
      socket.to(room).emit('usuario_saiu', { 
        socket_id: socket.id, 
        nome: socket.user?.nome || 'Usuário' 
      });
      if (Object.keys(salas[room].users).length === 0) {
        delete salas[room];
      }
    }
    console.log('🔴 Desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 URL: https://positive-forgiveness-production-de45.up.railway.app`);
  console.log(`📊 Status: https://positive-forgiveness-production-de45.up.railway.app/status`);
});
