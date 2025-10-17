import express from "express";
import userRouter from "./routers/user.js";
import workerRouter from "./routers/worker.js"
import cors from "cors";
const app = express();
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:3000',  // Your frontend URL
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use("/v1/user", userRouter);
app.use("/v1/worker", workerRouter);

app.listen(3001, () => {
    console.log("Server runing at port: 3001");
    
})