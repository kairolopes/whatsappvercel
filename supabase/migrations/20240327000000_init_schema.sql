-- create table conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    last_message TEXT,
    last_message_time VARCHAR(10),
    unread_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create index for conversations
CREATE INDEX idx_conversations_active ON conversations(is_active);
CREATE INDEX idx_conversations_time ON conversations(last_message_time DESC);

-- grant permissions for conversations
GRANT SELECT ON conversations TO anon;
GRANT ALL PRIVILEGES ON conversations TO authenticated;

-- create table messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    text TEXT NOT NULL,
    sender VARCHAR(50) NOT NULL CHECK (sender IN ('user', 'other')),
    timestamp VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'sent',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create index for messages
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(created_at DESC);

-- grant permissions for messages
GRANT SELECT ON messages TO anon;
GRANT ALL PRIVILEGES ON messages TO authenticated;

-- init data
INSERT INTO conversations (contact_name, avatar_url, last_message, last_message_time, unread_count) VALUES
('João Silva', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=faces', 'Olá, tudo bem?', '14:30', 2),
('Maria Santos', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=faces', 'Até mais!', '13:45', 0),
('Pedro Oliveira', 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&h=150&fit=crop&crop=faces', 'Obrigado!', '12:20', 1);

INSERT INTO messages (conversation_id, text, sender, timestamp, status) VALUES
((SELECT id FROM conversations WHERE contact_name = 'João Silva' LIMIT 1), 'Olá, tudo bem?', 'other', '14:30', 'sent'),
((SELECT id FROM conversations WHERE contact_name = 'João Silva' LIMIT 1), 'Oi! Tudo sim!', 'user', '14:31', 'read');
