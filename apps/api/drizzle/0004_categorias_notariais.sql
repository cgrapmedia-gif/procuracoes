-- Novas categorias do catálogo alargado (poderes habituais em notários e conservatórias em Portugal)
INSERT INTO power_categories (code, name, sort) VALUES
  ('CONDOMINIO', 'Condomínio', 100),
  ('SERVICOS', 'Água, electricidade, gás e telecomunicações', 101),
  ('CORRESPONDENCIA', 'Correspondência e CTT', 102),
  ('NACIONALIDADE', 'Nacionalidade, migração e legalizações', 103),
  ('DOACOES', 'Doações', 104),
  ('SAUDE_EDUCACAO', 'Saúde e educação', 105)
ON CONFLICT (code) DO NOTHING;
