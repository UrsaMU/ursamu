import { jwt } from "../../../deps.ts";

export const sign = (payload: any): Promise<string | void> =>
  new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      process.env.JWT_SECRET || "TotallyNotSoSecure",
      { expiresIn: "1h" },
      (err: any, token: any) => {
        if (err) reject(err);
        resolve(token);
      }
    );
  });

export const verify = (token: string): Promise<jwt.JwtPayload | unknown> =>
  new Promise((resolve, reject) => {
    jwt.verify(
      token,
      process.env.JWT_SECRET || "TotallyNotSoSecure",
      (err: any, decoded: any) => {
        if (err) reject(err);
        resolve(decoded);
      }
    );
  });
