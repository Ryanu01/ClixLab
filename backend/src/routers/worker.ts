import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { workerauthMiddlerware } from "../middleware.js";
import { getNextTask } from "../db.js";
import { createSubmissionInput } from "../types.js";

const TOTAL_SUBMISSION = 100;

const TOTAL_DECIMALS = 1000;

const jwtSecret = process.env.JWT_SECRET_WORKER || "";
const prismaClient = new PrismaClient();
const router = Router();


router.post("/payout", workerauthMiddlerware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId
    const worker = await prismaClient.worker.findFirst({
        where: {
            id: Number(userId)
        }
    })

    const address = worker?.address;

    if(!address) {
        return res.json({
            message : "User not found"
        })
    }
    //logic to create a txns
    const txnId = "0x1226546"


    // user is able to send multiple reqts need to fix this 
    // dont knwo how though
    console.log(worker.pending_amount);
    await prismaClient.$transaction(async tx => {
        await tx.worker.update({
            where: {
                id: Number(userId)
             }, 
             data: {
                pending_amount: {
                    decrement: worker.pending_amount
                },
                locked_amount: {
                    increment: worker.pending_amount
                }
             }
        })
        
        await tx.payouts.create({
            data: {
                worker_id: Number(userId),
                amount: worker.pending_amount,
                status: "Processign",
                signature: txnId
            }
        })
    })
    
    console.log(worker.locked_amount);
    /**
     * After doing this we need to send the tnx to eth/sol
     * blockchain
     */

    res.json({
        message: "Processing payout",
        amount: worker.pending_amount
    })
})

router.get("/balance", workerauthMiddlerware, async (req, res) => {

    // @ts-ignore
    const userId: string = req.userId;

    const worker = await  prismaClient.worker.findFirst({
        where: {
            id: Number(userId)
        }
    })

    res.json({
        pendingAmount: worker?.pending_amount,
        lockedAmount: worker?.locked_amount
    })

})

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

        const amountMade = (task.amount) / TOTAL_SUBMISSION
        console.log(amountMade);

        const submission = await prismaClient.$transaction(async tnx => {

            const submission = await tnx.submission.create({
                data: {
                    option_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount: amountMade
                },

            })
            console.log("new line", amountMade);

            await tnx.worker.update({
                where: {
                    id: userId
                },
                data: {
                    pending_amount: {
                        increment: amountMade
                    }
                }
            })

            return submission
        },
            {
                maxWait: 5000, // default 2000ms - time to wait for transaction to start
                timeout: 10000,
            })



        const nextTask = await getNextTask(userId);
        res.json({
            nextTask,
            amountMade
        })
    } else {
        res.status(411).json({
            message: "Error occured while submiting next task"
        })
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
