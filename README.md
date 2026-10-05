# Annotate Studio

**Read. Annotate. Remember.**

Annotate Studio is a local-first learning application built around one idea: studying should happen in one place, with the tools you actually need.

It combines reading, annotation, AI assistance, flashcards, exams, focused study sessions, and personal study support into a single workspace.

The application is built with **Tauri + Rust** and **Next.js**, with local AI at its core.

## Features

### Canvas

Create a study canvas and bring your materials together.

* PDF documents
* Markdown notes
* Images
* An AI assistant connected to your study materials
* Explain concepts step by step
* Ask questions directly about your materials

The assistant can also help you:

* Summarize
* Extract key notes
* Compare and contrast
* Build timelines
* Create mind maps
* Answer "why" and "how" questions
* Create cheat sheets
* Find contradictions

### Flashcards

Create flashcards manually or generate them with AI.

Annotate Studio uses spaced repetition to help you review what you are learning. Difficult cards come back more often, while easier cards gradually require less attention.

### Exams

Create practice exams manually or generate them with AI.

Both descriptive and multiple-choice questions are supported. AI can also help solve and evaluate your answers.

### Pomodoro

A built-in Pomodoro timer helps you structure study sessions with focused work periods and short or long breaks.

### Motivation

Studying is not always about productivity.

The Motivation page gives you a space to talk with AI about exams, stress, sleep, anxiety, motivation, or simply whatever is on your mind.

### AI Providers

Annotate Studio is designed around flexible AI providers.

You can use local AI through **Ollama**, or connect external providers such as **OpenAI**, **Gemini**, and other supported APIs.

Your learning workflow does not have to depend on a single provider.

## Local-first

Annotate Studio is designed to keep your learning environment under your control.

The goal is to make the application useful with local models and local data, while still allowing cloud AI providers when you choose to use them.

## Installation

Pre-built application binaries are currently distributed through **GitHub Actions workflow artifacts**.

Download the artifact from the latest successful workflow run.

## Development

Clone the repository:

```bash
git clone --depth 1 https://github.com/annotate-studio/annotate-studio
cd annotate-studio
```

Install dependencies:

```bash
npm install
```

Install the Tauri CLI:

```bash
cargo install tauri-cli
```

Run the application in development mode:

```bash
cargo tauri dev
```

Build the application:

```bash
cargo tauri build
```

## Project Status

Annotate Studio is an actively developed open-source project.

The application is currently **heavily AI-engineered**. AI has been an important part of getting the project from idea to a working product, but that is not the end goal.

Over time, we want to continuously refactor the codebase, improve its architecture and maintainability, and optimize performance.

The goal is simple: **use AI to build faster, then make the resulting software genuinely good.**

## Next Steps

Still evolving! Some of the things I want to explore next include:

* Professional LaTeX support alongside Markdown for technical and academic writing.
* Presentation creation, making it possible to turn study materials into structured presentations.
* Document editing and export, including PPTX and DOCX formats compatible with Microsoft Office and Google Workspace.
* Better agentic workflows, allowing AI agents to organize, transform, and export study materials more effectively.
* Deep thinking and argumentation, giving the AI better capabilities for reasoning through complex ideas, evaluating arguments, and challenging conclusions.
* Efficient long-context management, allowing the application to work effectively with large collections of books, papers, notes, and other study materials without losing important context.

The long-term goal is not simply to add more AI features, but to build a learning environment where AI can genuinely understand, organize, and work with the material you are studying.

## Credit

[I](https://github.com/tahadostifam) built Annotate Studio to bring together the study tools I personally needed in one place: spaced-repetition flashcards, exam practice, PDF annotation, a Pomodoro timer, and optional AI assistance. I decided to make it open source so that other students could benefit from it as well.

I also want to give my sincere thanks to CluvexStudio for the passionate work put into improving and testing Annotate Studio. His time, feedback, testing, and attention to detail have helped make the application better throughout its development. I genuinely appreciate the effort and care they have put into the project.

## Contribution

Annotate Studio is fully open source and distributed under a custom [license](https://github.com/annotate-studio/annotate-studio/blob/main/LICENSE).

Issues and PRs are welcome. Contributions are reviewed before being accepted.
