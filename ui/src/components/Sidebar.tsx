import { useState, useEffect } from "react";
import { chatAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import "@/styles/Sidebar.css";

interface ChatHistory {
  id: string;
  title: string;
  timestamp: string;
}

const Sidebar = ({
  onSelectChat,
}: {
  onSelectChat: (chatId: string) => void;
}) => {
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);

  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const response = await chatAPI.getChatHistory();
        setChatHistory(response.data);
      } catch (error) {
        console.error("Error fetching chat history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChatHistory();
  }, []);

  const handleSelectChat = (chatId: string) => {
    setSelectedChat(chatId);
    onSelectChat(chatId);
  };

  const handleNewChat = () => {
    setSelectedChat(null);
    // Optionally trigger a new chat in parent
    onSelectChat("");
  };

  return (
    <div className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <Button
        variant="ghost"
        size="icon"
        className="collapse-button"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </Button>
      <div className="sidebar-content">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <Plus
              size={18}
              style={{ marginRight: 8, verticalAlign: "middle" }}
            />
            New chat
          </button>
          <h2>Chat History</h2>
        </div>
        <div className="chat-list">
          {loading ? (
            <div className="loading">Loading chats...</div>
          ) : chatHistory.length === 0 ? (
            <div className="no-chats">No chat history yet</div>
          ) : (
            chatHistory.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item${
                  selectedChat === chat.id ? " selected" : ""
                }`}
                onClick={() => handleSelectChat(chat.id)}
              >
                <div className="chat-title">{chat.title}</div>
                <div className="chat-timestamp">{chat.timestamp}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
