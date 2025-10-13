import { NoSuchBucket } from "@aws-sdk/client-s3";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function authMiddlerware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers["authorization"] ?? "";

    try {
        const decoded = jwt.verify(authHeader, process.env.JWT_SECRET ?? "")
        // @ts-ignore
        if(decoded.userId) {
            // @ts-ignore
            req.userId = decoded.userId;
            return next();
        } else {
            return res.status(403).json({
            message: "You are not loged in"
        })
        }
    } catch (error) {
        return res.status(403).json({
            message: "You are not loged in"
        })
    }
}