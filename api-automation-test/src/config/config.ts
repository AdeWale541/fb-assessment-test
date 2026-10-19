import dotenv from 'dotenv';
dotenv.config();

function requiredEnv(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback;
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const config = {
    API_BASE_URL: requiredEnv('API_BASE_URL', 'http://localhost:3000'),
    API_TOKEN: requiredEnv('API_TOKEN', 'novapay-dev-token'),
};

export default config;
