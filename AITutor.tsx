
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from './types';
import { LOGO_URL } from './constants';

const SYSTEM_INSTRUCTION = `You are a friendly, encouraging, and knowledgeable AI Tutor for students at Katsina State Institute of Technology & Management (KSITM). 
Your goal is to help students understand their courses (Computer Science, Engineering, Management, etc.).
- Be concise but helpful.
- Use simple English.
- If asked for a quiz, generate 3-5 multiple choice questions.
- If asked to summarize, provide bullet points.
- Always be polite and encouraging.`;

export default function AITutor() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am your KSITM AI Tutor. I can help you summarize notes, explain complex topics, or quiz you for exams. What are we learning today?',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Construct history for context
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [...history, { role: 'user', parts: [{ text: textToSend }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "I'm having trouble thinking right now. Please try again.",
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "Sorry, I encountered an error connecting to the server. Please check your connection.",
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const SuggestionChip = ({ text, prompt }: { text: string, prompt: string }) => (
    <button 
      onClick={() => handleSend(prompt)}
      className="whitespace-nowrap bg-blue-50 dark:bg-slate-700 text-ksitmb dark:text-blue-200 text-sm px-4 py-2 rounded-full border border-blue-100 dark:border-slate-600 hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors"
    >
      {text}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 p-4 shadow-sm flex items-center justify-between sticky top-0 z-10 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-ksitmb flex items-center justify-center p-1">
             <img 
               src={LOGO_URL} 
               alt="Logo" 
               onError={(e) => e.currentTarget.src = "https://ui-avatars.com/api/?name=KSITM&background=002147&color=fff&size=64&bold=true"}
               className="w-full h-full object-contain rounded-full bg-white p-0.5" 
             />
          </div>
          <div>
            <h2 className="font-bold text-gray-800 dark:text-white">KSITM AI Tutor</h2>
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span> Online
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-slate-900 scrollbar-hide">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-ksitmb text-white rounded-tr-none' 
                  : msg.isError 
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-100 dark:border-red-900/30 rounded-tl-none'
                    : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-slate-700 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</div>
              <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-none px-4 py-3 border border-gray-100 dark:border-slate-700 shadow-sm flex gap-2 items-center">
              <div className="w-2 h-2 bg-ksitmb dark:bg-blue-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-ksitmb dark:bg-blue-400 rounded-full animate-bounce delay-75"></div>
              <div className="w-2 h-2 bg-ksitmb dark:bg-blue-400 rounded-full animate-bounce delay-150"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-slate-900 border-t dark:border-slate-800 p-3 space-y-3 transition-colors">
        {/* Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <SuggestionChip text="Explain this topic" prompt="Explain the topic of [TOPIC] simply." />
          <SuggestionChip text="Quiz me" prompt="Generate 3 quiz questions about my recent courses." />
          <SuggestionChip text="Summarize text" prompt="Summarize this text: " />
          <SuggestionChip text="Study Tips" prompt="Give me 5 study tips for engineering students." />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask your tutor anything..."
            className="flex-1 bg-gray-100 dark:bg-slate-800 border-0 rounded-full px-4 py-3 text-sm focus:ring-2 focus:ring-ksitmb dark:focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
            disabled={loading}
          />
          <button 
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="w-12 h-12 bg-ksitmb rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-900 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
