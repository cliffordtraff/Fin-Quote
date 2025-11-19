export declare function verifyIdToken(token: string): Promise<{
    uid: string;
    email?: string;
} | null>;
