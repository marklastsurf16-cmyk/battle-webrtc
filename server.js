const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configurar CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO com CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    salas: Object.keys(salas).length,
    timestamp: new Date().toISOString()
  });
});

// Armazenar salas
const salas = {};

// WebRTC - Sinalização via Socket.IO
io.on('connection', (socket) => {
  console.log(`🟢 Usuário conectado: ${socket.id}`);

  // Criar ou entrar em uma sala
  socket.on('entrar_sala', (data) => {
    const { desafio_id, usuario_id, nome } = data;
    const roomName = `batalha_${desafio_id}`;
    
    socket.join(roomName);
    socket.roomName = roomName;
    socket.usuario_id = usuario_id;
    socket.nome = nome;

    // Inicializar sala se não existir
    if (!salas[roomName]) {
      salas[roomName] = {
        users: {},
        offer: null,
        answer: null,
        offerFrom: null,
        answerFrom: null
      };
    }

    // Adicionar usuário
    salas[roomName].users[socket.id] = {
      usuario_id,
      nome,
      socket_id: socket.id
    };

    // Notificar outros usuários
    socket.to(roomName).emit('usuario_entrou', {
      usuario_id,
      nome,
      socket_id: socket.id
    });

    // Enviar lista de usuários para o novo usuário
    const usuarios = Object.values(salas[roomName].users);
    socket.emit('usuarios_na_sala', usuarios);

    console.log(`📥 ${nome} entrou na sala ${roomName}`);
    console.log(`👥 Usuários na sala: ${usuarios.length}`);
  });

  // WebRTC: Offer (quem inicia a chamada)
  socket.on('webrtc_offer', (data) => {
    const { offer, target_id } = data;
    const roomName = socket.roomName;

    if (roomName && salas[roomName]) {
      // Salvar offer
      salas[roomName].offer = offer;
      salas[roomName].offerFrom = socket.id;

      // Enviar para o alvo específico
      io.to(target_id).emit('webrtc_offer_received', {
        offer: offer,
        from_id: socket.id,
        from_nome: socket.nome
      });

      console.log(`📤 Offer enviado de ${socket.nome} para ${target_id}`);
    }
  });

  // WebRTC: Answer (quem responde)
  socket.on('webrtc_answer', (data) => {
    const { answer, target_id } = data;
    const roomName = socket.roomName;

    if (roomName && salas[roomName]) {
      // Salvar answer
      salas[roomName].answer = answer;
      salas[roomName].answerFrom = socket.id;

      // Enviar para o alvo
      io.to(target_id).emit('webrtc_answer_received', {
        answer: answer,
        from_id: socket.id,
        from_nome: socket.nome
      });

      console.log(`📥 Answer enviado de ${socket.nome} para ${target_id}`);
    }
  });

  // WebRTC: ICE Candidate
  socket.on('webrtc_ice_candidate', (data) => {
    const { candidate, target_id } = data;
    const roomName = socket.roomName;

    if (roomName && salas[roomName]) {
      // Enviar para todos na sala menos para o remetente
      socket.to(roomName).emit('webrtc_ice_candidate_received', {
        candidate: candidate,
        from_id: socket.id
      });
    }
  });

  // Solicitar offer existente
  socket.on('get_offer', () => {
    const roomName = socket.roomName;
    if (roomName && salas[roomName] && salas[roomName].offer) {
      socket.emit('offer_received', {
        offer: salas[roomName].offer,
        from_id: salas[roomName].offerFrom
      });
    }
  });

  // Sair da sala
  socket.on('sair_sala', () => {
    const roomName = socket.roomName;
    if (roomName && salas[roomName]) {
      // Remover usuário
      delete salas[roomName].users[socket.id];
      
      // Notificar outros
      socket.to(roomName).emit('usuario_saiu', {
        socket_id: socket.id,
        nome: socket.nome
      });

      // Se não houver mais usuários, remover sala
      if (Object.keys(salas[roomName].users).length === 0) {
        delete salas[roomName];
        console.log(`🗑️ Sala ${roomName} removida`);
      }
    }
    socket.leave(roomName);
    console.log(`🔴 Usuário ${socket.id} saiu`);
  });

  // Desconexão
  socket.on('disconnect', () => {
    const roomName = socket.roomName;
    if (roomName && salas[roomName]) {
      // Remover usuário
      delete salas[roomName].users[socket.id];
      
      // Notificar outros
      socket.to(roomName).emit('usuario_saiu', {
        socket_id: socket.id,
        nome: socket.nome
      });

      // Se não houver mais usuários, remover sala
      if (Object.keys(salas[roomName].users).length === 0) {
        delete salas[roomName];
        console.log(`🗑️ Sala ${roomName} removida`);
      }
    }
    console.log(`🔴 Usuário ${socket.id} desconectado`);
  });
});

// Porta do servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`📡 Status: http://localhost:${PORT}/status`);
});
