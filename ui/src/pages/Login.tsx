import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import "@/styles/Login.css";

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      //   const response = await authAPI.login(formData);
      //   localStorage.setItem("token", response.data.token);
      localStorage.setItem("token", "1234567890");
      navigate("/chat");
    } catch (err: any) {
      setError(err.response?.data?.message || "An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <Input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <Input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p>
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-primary hover:underline"
            >
              Sign up
            </button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;
