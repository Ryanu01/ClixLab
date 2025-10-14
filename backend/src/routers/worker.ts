import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { workerauthMiddlerware } from "../middleware.js";

const jwtSecret = process.env.JWT_SECRET_WORKER || "";
const prismaClient = new PrismaClient();
const router = Router();

router.get("/nextTask", workerauthMiddlerware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;

    const task = await prismaClient.task.findFirst({
        where: {
            done: false,
            submissions: {
                none: {
                    worker_id: userId
                }
            }
        },
        select: {
            title: true,
            options: true
        }
    })

    if(!task) {
        res.status(411).json({
            message: "No more tasks left for you to review"
        })
    }else {
        res.status(200).json({
            task
        })   
    }
})

router.post("/signin", async (req, res) => {
    const hardcodedWalletAddress = process.env.PUBLIC_ADDRESS || "";

    const existingUser = await prismaClient.worker.findFirst({
        where: {
            address: hardcodedWalletAddress
        }
    })

    if (existingUser) {

        const token = jwt.sign({
            userId: existingUser.id
        }, jwtSecret)
        res.json({ token })
    } else {

        const user = await prismaClient.worker.create({
            data: {
                address: hardcodedWalletAddress,
                pending_amount: 0,
                locked_amount: 0
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, jwtSecret)
        res.json({ token })
    }
});

export default router;
