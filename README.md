# DevConnect

## Overview

DevConnect is an AI-powered engineering operations workspace that helps development, DevOps, and security teams investigate incidents, collaborate in real time, and resolve issues faster using Splunk-powered operational intelligence and AI agents.

The platform combines team communication, incident response workflows, observability insights, and AI-assisted troubleshooting into a single collaborative environment.

---

## Problem

Engineering teams often rely on multiple disconnected tools to monitor systems, investigate incidents, communicate with teammates, and document resolutions.

During critical incidents, valuable time is lost switching between dashboards, chat applications, monitoring tools, and documentation platforms.

DevConnect addresses this challenge by creating a centralized workspace where teams and AI agents can collaborate around operational data and incident investigations.

---

## Features

### AI Incident Investigation

* Analyze operational events and logs
* Generate incident summaries
* Provide root cause analysis suggestions
* Recommend remediation actions

### Team Collaboration

* Real-time messaging
* Incident response channels
* Team workspaces
* Shared investigation sessions

### Voice & Video Communication

* Real-time collaboration during incidents
* Engineering war rooms
* Cross-team coordination

### Splunk Integration

* Access operational insights
* Analyze monitoring data
* Investigate alerts and anomalies
* Improve incident response workflows

### Knowledge Sharing

* Incident documentation
* Investigation history
* Team knowledge base
* Post-incident reporting

---

## How It Works

1. An operational issue or incident is detected.
2. Engineers create or join an incident workspace.
3. Splunk data is analyzed and surfaced within DevConnect.
4. AI agents investigate patterns and provide insights.
5. Team members collaborate through chat, voice, and video.
6. AI generates summaries and recommendations.
7. Teams resolve incidents faster and document outcomes.

---

## Technology Stack

### Frontend

* React
* Tailwind CSS

### Backend

* Node.js
* Express.js

### Database

* Firebase Firestore

### Authentication

* Firebase Authentication

### AI Services

* Gemini API
* AI Investigation Agents

### Observability & Monitoring

* Splunk APIs
* Splunk Operational Data

### Real-Time Communication

* WebRTC
* WebSockets

### Hosting

* Vercel

---

## System Architecture

See `architecture_diagram.png` in the root directory.

The architecture includes:

* Client Application
* Backend Services
* Firebase Database
* Splunk Integration Layer
* AI Agent Layer
* Real-Time Communication Services

---

## Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/devconnect.git
```

Navigate to the project folder:

```bash
cd devconnect
```

Install dependencies:

```bash
npm install
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key
SPLUNK_API_KEY=your_api_key
FIREBASE_API_KEY=your_api_key
FIREBASE_PROJECT_ID=your_project_id
```

---

## Running the Application

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run production build:

```bash
npm start
```

---

## Future Roadmap

* Multi-agent incident investigation
* Automated incident triage
* Predictive anomaly detection
* AI-generated remediation plans
* Advanced observability dashboards
* Security operations workflows
* Enterprise deployment support
* Additional Splunk integrations

---

## License

MIT License

---

## Contributors

Built for the Splunk Agentic Ops Hackathon 2026.

DevConnect demonstrates how AI agents, operational intelligence, and team collaboration can work together to improve incident response and engineering productivity.
