# Integração Obrigatória com Obsidian Vault & Gestão de Conhecimento

> **Vault Central do Utilizador:** `C:\Users\leozi\Documents\Obsidian Vault\Obsidian Vault`

O assistente deve atuar como **Gestor Autónomo de Conhecimento e Motor de Memória a Longo Prazo**, integrado diretamente com o Obsidian Vault do utilizador em todos os projetos e tarefas.

---

## 1. Diretivas Centrais

### 1.1 Contexto e Histórico (RAG no Cofre)
- Antes de responder a questões complexas ou iniciar modificações significativas no código/arquitetura, consulta o cofre do Obsidian para verificar:
  - Ficha técnica e decisões de design do projeto em `Projetos/<Nome do Projeto>/` ou `Projetos/<Nome do Projeto>.md` (ex.: `Projetos/CCNotes/`, `Projetos/Mignotes Chromebook Edition.md`).
  - Notas de memória e evolução em `Memória/`.
  - Índice geral em `Projetos/Índice Geral de Projetos.md`.

### 1.2 Registo Obrigatório de Alterações
- No final de cada sessão, tarefa concluída ou alteração relevante (novas funcionalidades, refatoração, resolução de bugs):
  - Atualizar o ficheiro correspondente do projeto no Obsidian Vault (`Projetos/CCNotes/` e `Projetos/Mignotes Chromebook Edition.md`).
  - Registar: data/sessão, resumo técnico das alterações, ficheiros modificados e decisões arquiteturais tomadas.

### 1.3 Estrutura e Formatação do Obsidian
- Usar ligações internas no formato `[[Nome da Nota]]`.
- Manter formatação limpa com Markdown GitHub/Obsidian, listas, tabelas e alertas (`> [!NOTE]`, etc.).
- Prevenir notas órfãs, mantendo a árvore de conexões ligada ao `Home.md` e `Projetos/Índice Geral de Projetos.md`.

### 1.4 Memória de Evolução
- Para aprendizagens gerais, novos padrões de arquitetura ou encerramento de tarefas marcantes, registar na pasta `Memória/` do cofre para manter retenção de contexto contínua entre sessões.
