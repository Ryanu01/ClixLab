import { PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { Router } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { authMiddlerware } from "../middleware.js";
import { createTaskInput } from "../types.js";
import nacl from "tweetnacl";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
dotenv.config();

const DEFAULT_TITLE = "select the most clickable thumbnail"
const router = Router();
const jwtSecret = process.env.JWT_SECRET || "";
const connection = new Connection(process.env.RPC_URL ?? "");
const PARENT_WALLET_ADDRESS = process.env.PUBLIC_ADDRESS ?? ""
const prismaClient = new PrismaClient();
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY || "",
        secretAccessKey: process.env.AWS_SECRET_KEY || ""
    },
    region: "ap-south-1"
})


prismaClient.$transaction(
    async (prisma) => {
        // Code running in a transaction...
    },
    {
        maxWait: 5000, // default: 2000
        timeout: 20000, // default: 5000
    }
)


router.get("/task", authMiddlerware, async (req, res) => {
    // @ts-ignore
    const taksId: String = req.query.taskId;

    // @ts-ignore
    const userId: String = req.userId;

    const taskDetails = await prismaClient.task.findFirst({
        where: {
            user_id: Number(userId),
            id: Number(taksId),
        },
        include: {
            options: true
        }
    })

    if (!taskDetails) {
        return res.status(411).json({
            message: "You dont have access to this task"
        })
    }

    const responses = await prismaClient.submission.findMany({
        where: {
            task_id: Number(taksId),
        },
        include: {
            option: true
        }
    });

    const result: Record<string, {
        count: number;
        option: {
            imageUrl: string
        }
    }> = {};

    taskDetails.options.forEach(option => {
        result[option.id] = {
            count: 0,
            option: {
                imageUrl: option.image_url
            }
        }
    })

    responses.forEach(r => {
        result[r.option_id]!.count++
    })


    res.json({

        taskDetails: {
            title: taskDetails.title

        }, result
    })
})

router.post("/task", authMiddlerware, async (req, res) => {
    const TOTAL_DECIMALS = process.env.TOTAL_DECIMALS ? Number(process.env.TOTAL_DECIMALS) : 1000000000;

    //validate the input from user
    const body = req.body;
    // @ts-ignore
    const userId = req.userId;
    const parseData = createTaskInput.safeParse(body)
    const taskAmount = Math.floor(0.1 * TOTAL_DECIMALS);

    console.log('TOTAL_DECIMALS:', TOTAL_DECIMALS);
    console.log('Task amount (in lamports):', taskAmount);

    if (!taskAmount || isNaN(taskAmount)) {
        return res.status(500).json({
            message: "Failed to calculate task amount. Check TOTAL_DECIMALS env variable."
        });
    }
    const user = await prismaClient.user.findFirst({
        where: {
            id: userId
        }
    })

    if (!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    if (!parseData.success) {
        return res.status(411).json({
            message: "You have sent the wrong inputs"
        })
    }

    const transaction = await connection.getTransaction(parseData.data.signature, {
        maxSupportedTransactionVersion: 1
    })

    console.log(transaction);

    if ((transaction?.meta?.postBalances[1] ?? 0) - (transaction?.meta?.preBalances[1] ?? 0) !== 100000000) {
        return res.status(411).json({
            message: "Transaction signature/amount incorrect"
        })
    }


    if (transaction?.transaction.message.getAccountKeys().get(1)?.toString() !== PARENT_WALLET_ADDRESS) {
        return res.status(411).json({
            message: "Transaction sent to worng address"
        })
    }

    if (transaction.transaction.message.getAccountKeys().get(0)?.toString() !== user?.address) {
        return res.status(411).json({
            message: "Transaction initialized from different wallet address"
        })
    }
    let response = await prismaClient.$transaction(async tx => {
        const response = await tx.task.create({
            data: {
                title: parseData.data.title || DEFAULT_TITLE,
                amount: taskAmount,
                signature: parseData.data.signature,
                user: {
                    connect: {
                        id: userId
                    }
                }
            }
        })

        await tx.option.createMany({
            data: parseData.data.options.map(x => ({
                image_url: x.imageUrl,
                task_id: response.id
            }))
        })
        return response
    })

    res.json({
        id: response.id
    })

})

router.get("/presignedUrl", authMiddlerware, async (req, res) => {

    // @ts-ignore
    const userId = req.userId;

    const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: 'clix-lab',
        Key: `clix-lab-store/${userId}/${Math.random()}/image.png`,
        Conditions: [
            ['content-length-range', 0, 5 * 1024 * 1024] // 5 MB max
        ],
        Fields: {
            'Content-Type': 'image/png'
        },
        Expires: 3600
    })

    res.json({
        presignedUrl: url,
        fields
    })
})

router.post("/signin", async (req, res) => {
    // Todo: Add sign verification logic here
    const { publicKey, signature } = req.body;
    const message = new TextEncoder().encode("Sign in to ClixLab")

    console.log(publicKey)
    const result = nacl.sign.detached.verify(
        message,
        new Uint8Array(signature.data),
        new PublicKey(publicKey).toBytes()
    )

    console.log(result);

    if (!result) {
        return res.status(411).json({
            message: "Incorrect signature"
        })
    }

    const existingUser = await prismaClient.user.findFirst({
        where: {
            address: publicKey
        }
    })

    if (existingUser) {

        const token = jwt.sign({
            userId: existingUser.id
        }, jwtSecret)
        res.json({ token })
    } else {

        const user = await prismaClient.user.create({
            data: {
                address: publicKey,
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, jwtSecret)
        res.json({ token })
    }

});

export default router;

