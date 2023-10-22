import { randomBytes } from "crypto";

const instId = (
    randomBytes(16).toString('base64').replace(/=+$/, '')
    + Date.now().toString()
);
let nextUniq = 0;

export default function nextId(): string {
    return `${instId}.${nextUniq++}`;
}
