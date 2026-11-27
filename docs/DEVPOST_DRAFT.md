# Devpost submission draft

## Somos Panas — an AI party host that collects everyone's share

Somos Panas gives every group of friends its own space on a subdomain, where they can organize meetups, invite people and keep the payment conversation clear. The public homepage lists only events their owner marked public.

The product has three visitors:

- **Public:** browses public events, the tutorial and the option to create a space.
- **Creator:** manages a site, its settings and the public visibility of its events.
- **Guest:** opens an event, confirms attendance and, on the legacy demo, reviews and approves a PayPal Sandbox payment.

A Napster avatar greets each visitor by text or voice, explains the product and guides the next step. It works only with a closed list of tools: it can list events, open one, prepare a draft, highlight a control or explain a section. It never publishes, confirms, deletes, sends messages or pays for the person.

The server creates short-lived Napster sessions and keeps the API key private. If video fails, the client falls back to Napster text mode and then to a fixed tutorial script.

Payments are PayPal Sandbox. Amounts are integer cents computed on the server; an approved order only becomes paid after the server verifies the capture. There is no escrow, Payouts, live money or automatic message sending.

**Built with:** TypeScript, React, Vite, Node.js, Fastify, PostgreSQL and Napster Omniagent. AI coding agents were used under Jorge's direction for implementation, review and documentation. The Napster integration is new work for this hackathon; the PayPal Sandbox flow and event model come from the earlier FiestaPay project.
