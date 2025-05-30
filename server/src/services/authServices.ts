import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db";

interface User {
  id: number;
  name: string;
  email: string;
  password: string;
}

export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
  private readonly SALT_ROUNDS = 10;

  async signup(
    name: string,
    email: string,
    password: string
  ): Promise<{ token: string; user: Omit<User, "password"> }> {
    // Check if user already exists
    const existingUser = await query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (existingUser.rows.length > 0) {
      throw new Error("User already exists with this email");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Create user
    const result = await query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }

  async login(
    email: string,
    password: string
  ): Promise<{ token: string; user: Omit<User, "password"> }> {
    // Find user
    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    console.log(user);

    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }

  private generateToken(user: Omit<User, "password">): string {
    return jwt.sign({ id: user.id, email: user.email }, this.JWT_SECRET, {
      expiresIn: "24h",
    });
  }
}
