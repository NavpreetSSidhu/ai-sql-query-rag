import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { chatAPI } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import "@/styles/Chat.css";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
}

const Chat = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
    }
  }, [navigate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      role: "user",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setLoading(true);

    try {
      const response = await chatAPI.sendMessage(inputMessage);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content:
          response.data.response ||
          response.data.answer ||
          "No response received",
        role: "assistant",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content:
          error.response?.data?.message ||
          "An error occurred while processing your request",
        role: "assistant",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChat = (chatId: string) => {
    // Implement chat selection logic
    console.log("Selected chat:", chatId);
  };

  return (
    <div className="chat-container">
      <Sidebar onSelectChat={handleSelectChat} />
      <div className="chat-main">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-prompt">What can I help with?</div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`message-wrapper ${
                  message.role === "user" ? "user-wrapper" : "assistant-wrapper"
                }`}
              >
                <div
                  className={`message ${
                    message.role === "user"
                      ? "user-message"
                      : "assistant-message"
                  }`}
                >
                  <div className="message-content">{message.content}</div>
                  <div className="message-timestamp">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="input-container">
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask anything"
            disabled={loading}
            className="message-input"
          />
          <Button
            type="submit"
            disabled={loading || !inputMessage.trim()}
            size="icon"
            className="send-button"
          >
            <Send size={20} />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Chat;
