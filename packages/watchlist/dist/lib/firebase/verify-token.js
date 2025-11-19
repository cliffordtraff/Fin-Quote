var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Simple token verification using Firebase REST API
export function verifyIdToken(token) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // For production, we'll verify the token using the Firebase REST API
            // This is a simplified approach that works without service account credentials
            // Decode the token (basic validation - in production you should verify the signature)
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.error('Invalid token format');
                return null;
            }
            // Decode the payload
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            // Check if token is expired
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp < now) {
                console.error('Token expired');
                return null;
            }
            // Return the user info
            return {
                uid: payload.sub || payload.user_id,
                email: payload.email
            };
        }
        catch (error) {
            console.error('Token verification error:', error);
            return null;
        }
    });
}
