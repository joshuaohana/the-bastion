import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateOtp(length = 6): string {
  let otp = '';
  for (let i = 0; i < length; i += 1) otp += CHARS[randomInt(CHARS.length)];
  return otp;
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export async function checkOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}
