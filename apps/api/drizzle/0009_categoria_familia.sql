-- Categoria para os poderes de família (casamento, divórcio, regime de bens) do catálogo do posto
INSERT INTO power_categories (code, name, sort) VALUES ('FAMILIA', 'Família (casamento, divórcio, regime de bens)', 106) ON CONFLICT (code) DO NOTHING;
