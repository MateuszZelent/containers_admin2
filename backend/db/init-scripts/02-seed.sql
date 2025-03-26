-- Dodanie użytkownika testowego (hasło: password123)
INSERT INTO users (username, email, hashed_password, is_active, is_superuser, code_server_password)
VALUES (
    'testuser',
    'test@example.com',
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', -- haszowane 'password123'
    TRUE,
    FALSE,
    'codeserver123'
) ON CONFLICT (username) DO NOTHING;
