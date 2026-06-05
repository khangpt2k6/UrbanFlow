<div align="center">

<img src="docs/img/welcome.png" alt="The UrbanFlow welcome screen" width="760">

<h1>UrbanFlow</h1>

<b>A tiny city intersection that comes alive in your browser.</b><br>
Up to 120 cars, buses, vans and ambulances pour through one crossing in real time, and never crash.

<br><br>

<img alt="Java" src="https://img.shields.io/badge/Java-17-orange?logo=openjdk&logoColor=white">
<img alt="Spring Boot" src="https://img.shields.io/badge/Spring%20Boot-3.2-6DB33F?logo=springboot&logoColor=white">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
<img alt="WebSocket" src="https://img.shields.io/badge/STOMP-WebSocket-010101?logo=socketdotio&logoColor=white">

<br><br>

<table>
<tr>
<td align="center"><b>120</b><br><sub>vehicles</sub></td>
<td align="center"><b>9</b><br><sub>kinds</sub></td>
<td align="center"><b>24</b><br><sub>lanes</sub></td>
<td align="center"><b>30</b><br><sub>threads</sub></td>
<td align="center"><b>2,000+</b><br><sub>updates / sec</sub></td>
<td align="center"><b>0</b><br><sub>collisions</sub></td>
</tr>
</table>

</div>

<p align="center">
  <img src="docs/img/hero.png" alt="A live top-down smart-city intersection with cars, bike lanes, footpaths and blocks of towers" width="880">
</p>

This is a little world I built to teach myself a few hard things by watching them happen, not by reading about them. Every dot on the road is a vehicle making its own decisions, all at the same time, many times a second. Below is what I actually learned along the way.

## Run it locally

You need **Java 17**, **Maven**, and **Node 18+**. Open two terminals.

**1. Backend** (the Java simulation engine, serves a WebSocket on port 8080):

```bash
cd backend
mvn spring-boot:run
```

**2. Frontend** (React + Canvas, talks to the backend over WebSocket):

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`) and press **Launch simulation**. Start the backend first, then the frontend.

> Tip: the control panel on the right lets you change traffic density live (up to 120 vehicles), retime the signals, and dispatch an ambulance or fire truck that flips the lights in its favour.

## Doing a hundred things at once (without it falling apart)

The whole point was traffic where every car thinks for itself, all together, all the time. That sounds simple until you try it: when a hundred little "minds" reach for the same shared world at the same instant, things normally corrupt or freeze.

The idea that made it click for me was surprisingly calm:

> Everyone reads from the same frozen **photo** of the world. Then a single referee writes the **next** photo. Nobody ever scribbles on the same page at the same time.

So roughly thirty workers can all look at the road at once (because a photo can't change while you read it), and only one of them is ever allowed to paint the next moment. With that one rule in place, the simulation never trips over itself and never locks up. That was the big lesson: the fix for chaos was not more locks and guards, it was giving everyone something that can't change underneath them.

## How it fits together

```mermaid
flowchart LR
    subgraph Browser["Browser (React + Canvas)"]
        UI["Cartoon city view + control panel"]
    end
    subgraph Engine["Spring Boot engine (~30 threads)"]
        Loop["30 Hz heartbeat"]
        Workers["~24 plan workers"]
        Snap[("immutable world snapshot")]
        Signals["signal + emergency controller"]
    end
    UI -- "controls (STOMP)" --> Loop
    Loop --> Workers --> Snap
    Signals --> Loop
    Snap -- "world snapshots (WebSocket)" --> UI
```

A few **design patterns** I picked up, in plain words:

- **The shared photo** - one snapshot of the world that everybody reads from, swapped out all at once. This is what keeps the crowd of workers from fighting.
- **The mailbox** - when you drag a slider or send an ambulance, it doesn't reach into the engine. It drops a note in a box, and the engine reads its mail when it's ready.
- **The heartbeat** - the world ticks about thirty times a second, like a game loop, so motion looks smooth even though the data arrives in little bursts.

The nicest surprise was how much of "good design" turned out to be about *who is allowed to touch what, and when*.

## The rules that keep everyone safe

To get to **zero crashes**, I had to teach the cars the same rules we all learned for the road. Writing them down as code made me realize how much careful etiquette is hidden in an ordinary intersection:

- **Keep your distance.** Every vehicle watches the one ahead and leaves a real gap, easing off the gas as it closes in.
- **Green means the whole path is yours.** The lights are timed so the streams that get a green never cross each other. Left turns get their own moment, with a yellow and an all-red pause in between.
- **Never block the box.** A car only enters the middle if it can make it all the way out. That single rule makes gridlock impossible.
- **A red light is a wall.** Cars stop cleanly at the line and wait their turn.
- **Make way for sirens.** An ambulance or fire truck flips the lights in its favour and everyone yields.

A watcher checks the whole road on every single heartbeat and confirms no two vehicles ever overlap. The `0 collisions` you see on screen isn't a hope, it's checked thousands of times a second.

<p align="center">
  <img src="docs/img/model.png" alt="Close-up of the intersection: signals, crosswalks and queued cars" width="620">
</p>

## A little living city

Nine kinds of vehicle, from a bicycle up to a fire truck, each with its own size and feel: a bus is heavy and slow off the line, a motorbike is nimble, and nothing ever spills over its lane lines. When a car eases off and stops, its brake lights glow red, so a queue waiting at a light reads as patient rather than frozen.

And because a bare grid of roads is lonely, I grew a small **smart city** around the crossing: dense blocks of towers standing shoulder to shoulder, concrete footpaths, protected green bike lanes painted along the kerb, street trees, and people who walk from door to door, crossing only at the crosswalks when their light turns. It is all hand-drawn on a canvas and laid out once from a fixed seed, so it never flickers and the same little world greets you every time.

## Tech stack

| Layer | What it uses |
|------|---------------|
| Engine | Java 17, Spring Boot 3.2, a fixed-rate scheduler and an immutable snapshot model |
| Transport | STOMP over WebSocket (SockJS fallback) |
| Frontend | React 19, TypeScript, Vite, hand-drawn HTML Canvas rendering |
| Tooling | Maven (backend), npm + Vite (frontend) |

<div align="center">
<br>
Built for the love of watching systems work.<br>
<sub>Java for the brain, React + Canvas for the window, streamed live over WebSocket.</sub>
</div>
