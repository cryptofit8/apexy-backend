import { Server, Socket } from 'socket.io';
import { APEX_ABI, APEX_ADDRESS, ERC20_ABI, JWT_SECRET, PORT, TRANSFER_EVENT, USDT_ADDRESS, connectDb as connectMongoDB } from "./config";
import jwt from "jsonwebtoken";
import MsgModel from './model/MsgModel';
import UserModel from './model/UserModel';
import NotificationModel from './model/NotificationModel';
import Web3 from "web3";
// @ts-ignore
import { Network, Alchemy, AlchemySubscription } from "alchemy-sdk";
import SocketModel from './model/SocketModel';
import { getAccountDetails } from './routes/WalletRoute/wallet';

const socketio = async (server: any) => {
  try {
    // Socket communication
    const io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    io.close(() => {
      console.log('Server and all connected sockets closed');
    });

    io.use((socket, next) => {
      const token = (socket.handshake.query.token as string).split('"')[1];
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          return next(new Error('Authentication error: Invalid token'));
        }
        // Attach user information to the socket
        (socket as any).user = decoded;

        next();
      });
    });

    io.on('connection', async (socket: Socket) => {
      const id = (socket as any).user.user.id;
      const user = await UserModel.findById(id)
      console.log(`socket (${socket.id}) -> ${id}`)
      if (user?.mnemonic!) {
        const { eth_wallet_address, tron_wallet_address } = getAccountDetails(user?.mnemonic!)
        await SocketModel.findOneAndUpdate({ userId: id, evm: eth_wallet_address, tron: tron_wallet_address }, { userId: id, socketId: socket.id, evm: eth_wallet_address, tron: tron_wallet_address }, { upsert: true })
      } socket.on('init', async () => {
        const data = await MsgModel.find().sort({ time: -1 }).limit(10);
        let returnValue: any[] = []
        console.log("data length", data.length)
        for (let index = 0; index < data.length; index++) {
          const res = await UserModel.findById(data[index].userId)
          returnValue.push({ ...data[index].toObject(), avatar: res!.avatar, username: res!.username })
        }
        console.log(returnValue)
        io.emit('broadcast', returnValue.reverse())
      });

      socket.on('new_msg', async (msg: string) => {
        console.log(`socket new msg ${msg}`)
        if (msg) {
          const newmsg = new MsgModel({
            userId: (socket as any).user.user.id,
            message: msg,
            time: new Date(),
          })
          await newmsg.save()
        }
        const data = await MsgModel.find().sort({ time: -1 }).limit(10);
        let returnValue: any[] = []
        console.log("data length", data.length)
        for (let index = 0; index < data.length; index++) {
          const res = await UserModel.findById(data[index].userId)
          returnValue.push({ ...data[index].toObject(), avatar: res!.avatar, username: res!.username })
        }
        console.log(returnValue)
        io.emit('broadcast', returnValue.reverse())
      });

      socket.on('notify', async () => {
        const data = await NotificationModel.find({ userId: id, isRead: false }).sort({ time: -1 }).limit(10);
        io.emit('notification', data)
      })

      socket.on('notifyall', async () => {
        const data = await NotificationModel.find();
        io.emit('notification', data)
      })
    })
  }
  catch (err) {
    if (String(err).includes("MongoNetworkError")) {
      console.log("mongodb disconnected")
      connectMongoDB()
    }
  }
}

export default socketio