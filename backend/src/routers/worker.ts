import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { workerauthMiddlerware } from "../middleware.js";
import { getNextTask } from "../db.js";
import { createSubmissionInput } from "../types.js";

const TOTAL_SUBMISSION = 100;

const TOTAL_DECIMALS = 1000_000_000;

const jwtSecret = process.env.JWT_SECRET_WORKER || "";
const prismaClient = new PrismaClient();
const router = Router();

router.post("/submission", workerauthMiddlerware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const body = req.body;
    const parsedBody = createSubmissionInput.safeParse(body);

    if (parsedBody.success) {
        const task = await getNextTask(userId)
        if (!task || task?.id !== Number(parsedBody.data.taskId)) {
            return res.status(411).json({
                message: "Incorrect task id"
            })
        }

        const amountMade = (Number(task.amount) / TOTAL_SUBMISSION).toString()

        const submission = await prismaClient.$transaction(async x => {

            const submission = await prismaClient.submission.create({
                data: {
                    option_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount: amountMade
                }
            })

            await prismaClient.worker.update({
                where: {
                    id: userId
                },
                data: {
                    pending_amount: {
                        increment: Number(amountMade) * TOTAL_DECIMALS
                    }
                }
            })

            return submission
        })



        const nextTask = await getNextTask(userId);
        res.json({
            nextTask,
            amountMade
        })
    } else {

    }
})

router.get("/nextTask", workerauthMiddlerware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId;

    const task = await getNextTask(Number(userId));

    if (!task) {
        res.status(411).json({
            message: "No more tasks left for you to review"
        })
    } else {
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
