Angular UI — Search Initiation
Spring Boot — API Gateway
Python FastAPI — Search Endpoint
Pipeline Stage 0: Adaptive Routing
Pipeline Stage 1: HyDE
Pipeline Stage 2: Retrieval
Pipeline Stage 3: Contextual Compression
Pipeline Stage 4: Chunk Quality Filter
Pipeline Stage 5: Synthesis
Pipeline Stage 6: Self-Reflection
Pipeline Stage 7: Final Assembly
Pipeline Stage 8: Disclaimer
Pipeline Response
Spring Boot Response Passthrough
Angular UI Result Rendering





**Bottom line: Not recommended.** The pipeline is a synchronous pure function — adding real-time progress events requires threading callbacks through Python → Java → WebSocket → Angular, which introduces side effects, coupling, and ongoing maintenance burden for a feature that's only visually meaningful on slow searches (>5s).

Key findings:

- **Resource impact is negligible** — ~10 fire-and-forget HTTP POSTs per search, ~2KB total data, no new WebSocket connections needed
- **The real cost is architectural** — the pipeline loses its purity as a side-effect-free function
- **Topic collision risk** — `/queue/ai-search-progress` is already used for batch embedding; stage events need a distinct discriminator
- **Event ordering** — fire-and-forget POSTs can arrive out of order; Angular would need to reorder by sequence number
- **For fast searches** (<2s with external LLM), the panel would flash through all stages instantly — invisible to the user

If implemented anyway, the report recommends Option A (Python fire-and-forget POSTs to a Java callback endpoint) with 5 specific safeguards.