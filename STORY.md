## The Beginning

This story started one evening when I was actively fixing a bunch of issues across my projects using Claude Code. I'd been using it for about a week and was mildly euphoric about how coherent and connected its work felt compared to my previous attempts with Cursor/Windsurf.

"Has AI finally stopped being a bullshit generator and learned to make coherent conclusions?" I thought. But the euphoria didn't last long. Claude (Sonnet 3.5) started doing all sorts of nonsense — missing edits, duplicating existing code, inventing nonexistent methods, disabling functionality "for debugging," and then spending hours trying to "fix" it in terrifying ways, having completely forgotten it was the one who disabled it. It became clear that the bright future hadn't arrived yet — gotta survive in the present.

Digging into the problem, I stumbled upon a great article about context issues and how AI agents treat code as plain text. They generate it as text too (without understanding structural connections). And when there's a lot of text/code, it's physically impossible to process it properly due to context limitations.

I immediately wanted to find possible solutions, and that's how I discovered the term "RAG." Most information led toward automated processing systems and their design, but I focused on local solutions and found several "local RAG" MVP projects. They were pretty niche — a regular user would struggle to set them up and run them. But I tried, and I managed to get [code-graph-rag](https://github.com/vitali87/code-graph-rag) working as an MCP server inside Claude. A bit later I figured out the others too.

The key takeaway from using code-graph-rag was that a built code graph combined with specialized code tools worked absolute wonders! All queries were fast and precise. No more crooked insertions, errors, lost coherence, or guessing method names — the AI could get perfect data for its work. Immediately, tons of ideas popped up about how to expand this and what awesome tools could be built on top.

But in real-world use, code-graph-rag (and the other tools) turned out to be painfully inconvenient. You had to restart re-indexing after every change (which meant waiting 2-3-4 minutes), and the tools were basic and demanded precise usage. Judging by GitHub activity, development was slow, and waiting for them to reach something acceptable would've taken a couple of years. I needed it ASAP. So I decided to improve them myself. I picked two projects (one for C# with Roslyn, another for everything else on TS), forked them, and started by cleaning up everything that stuck out or was outdated (luckily I had the experience). Things got a tiny bit faster. But to make them truly better, I needed to fundamentally change their architecture and a lot of code. Initially I tried to do it neatly, preserving the ability to PR back to the original. But then everything went sideways and it became clear no maintainer would accept this kind of code from me. So I created new projects from scratch and started pulling in code and various solution recipes.

Since I didn't have a clear architecture vision but had the goal of "making a convenient tool," I decided to improvise as freely as possible — in different branches I tried different architectural approaches, tested them, kept the good stuff, buried the failures. What's funny is that I was essentially doing "UX for an AI agent," not for a human — even though I have tons of experience in UX design/research specifically for "humans." The tool, in my mind, had to let the AI agent fly, not "crawl through code on grep+sed."

I set myself up to implement the following in the best possible way:

- Automatic indexing and background incremental indexing
- Justified resource consumption (no waste)
- Semantic command mode ("find all auth methods," without requiring exact names)
- Ultra-speed tools (~200ms per query, ~10sec for indexing)
- Maximum set of tools needed in everyday code work
- Automatic tool combos, since you'd end up running them in the same order manually anyway

The development story is pretty chaotic, so I'll tell it topic by topic.

## Architecture

It all started with launching the app directly via stdio. The app would start, check the local database in the .ultrascript/.ultrasharp directory. Re-index if needed. But if you launched multiple sessions — each one fired up its own process. Since early versions kept a lot in memory, RAM just vanished. And it bugged me that processes were sitting there wasting resources.

Initially I started thinking about client-server architecture, where there's one heavy server for the company and users connect with their "thin clients." A corporate solution that came to mind when you see one process per project eating 12GB+ RAM. But as the app got optimized, it became clear everything could be made less resource-hungry, and client-server architecture could help with that locally too.

I implemented separate "proxy" processes that only handle data forwarding and launching a single instance of the main app. And taught the app to handle multiple requests correctly alongside the index. Then I tried to make the proxy processes as lightweight as possible, but they still needed a runtime that ate 20 to 120 MB just for existing.

The idea came to write them in pure C. But then came the need to build a whole bunch of them for different architectures and OSes. And I found an elegant solution through Cosmopolitan-C, where a single .COM file contains executable code for all OSes and architectures. The ultra-com-file ended up being 740KB. Though Claude on Windows launches .com files incorrectly, so I had to make a copy with an .exe extension for that case.

Then there were lots more issues from processes working together across different contexts on the same app. Had to shake up all the code and implement cleaner internal processes.

## Bun

My journey with Bun started by using it instead of yarn/npm. But since vanilla Node.js was, let's say, not exactly frugal with resources — I started looking at alternatives and discovered (almost by accident) that "Bun is more than a package manager."

The first thing that blew my mind was its file handling speed. Never had I seen an existing program on my PC move 8GB of node_modules in half a second! That's some sci-fi stuff. Started running JS code on it and it showed incredible speed with low memory and CPU usage! Read about its capabilities and started migrating calls in the code to its native implementations.

But things got complicated. At some point, mysterious crashes started happening in unexpected places — SEGFAULTs. Took a lot of time to figure out the causes:

- Bun doesn't support running native Node processes (mine crashed trying to detect GPU).
- Bun doesn't like setTimeout/setInterval (and there were oh so many of those in the code) because they create new internal processes that break its runtime.

Native modules were moved to a separate Node.js subprocess (the indexer and some GPU compute functions for tools). Intervals were replaced with async loops or bun.sleep. But I kept Node.js launch support for the main process for compatibility.

Separately tackled speeding up file reads with Bun. Turned out the problem wasn't the reading itself, but opening/closing file descriptors. Couldn't get full native Bun speed, but compared to Node.js the speedup was up to x17 in some places.

## Parsers

Originally the prototype projects used old tree-sitter parsers (TS). I started updating them — that helped, but they turned out to be very unevenly maintained. For some languages, parsers had been abandoned ages ago. When I needed to extract 8x more entities from code for the tools I was building — parsers couldn't handle it all, and what they could handle slowed them down and bloated resources. Indexing my own project took up to 240 seconds.

Started trying more advanced parsers, including native ones (usually Rust ports), but they're all too different with various limitations each.

Then I remembered the magic letters ANTLR and that grammars for it are publicly available. Parsing started extracting more entities and running faster. Yay!

After a while, I was updating the oxc linter in my VSCode and realized oxc parsers were even better. Tried them — another improvement.

But soon I needed even more entities from the code. Only native parsers could do that. But it felt weird bundling them all in my package. Then it hit me — no developer writes a program without compiling it. 99.99% of projects have a native runtime/compiler. You can count on them being there. Implemented everything through native tools — significantly faster and maximally complete.

The Roslyn parser for C# was the most work — had to write it in .NET. Runs as a separate process.

## Parsing

A single parser wasn't fast. But it didn't use many resources either. And I was willing to give it more resources for speed. It wouldn't take them. Came up with launching multiple subprocesses (not exceeding SSD channel limits and free CPU threads) — way better.

But another problem popped up — parsers accumulated memory. Took a long time figuring out what was happening. Turned out it was the kind of memory that's beyond bun/node processes and unmanaged. Had to make auto-indexing parsers disposable, and restart incremental parsers when they accumulated too much extra memory.

Then I discovered parsers were loading parsing code for ALL languages (even though we know only one language needs parsing here). Made parsers language-specific.

Then came balancing issues. 8 parsers finish quickly while the remaining one keeps chugging. Built an adaptive predictive file balancing system across parsers.

Looked at what exactly parsers were sending into generation. And what a fight was happening in the queue to get into the model. Ended up reworking delivery through a central process. Also added file filtering and exclusion of global embeddings before parsing, and in the central process — another sort and dedup before sending to the model.

## Embeddings

It all started with Ollama (everyone starts there). Installs and works as simply and automatically as possible. Supports GPU to some degree. What more could you want? Speed! 500emb/s — that's not enough.

Found out about TEI, got excited, added support, started experimenting. Immediate problem — my GTX 5060 wasn't supported. Found a link in the depths of some issues to someone's fork with CUDA 120 support, launched it. Got almost 800emb/s. After several optimization rounds, got to 1300emb/s (2400emb/s peak). Spoiler: eventually on the new TEI without the fork — hit 2800emb/s (5400emb/s peak).

But I'd heard about vLLM too. Added its support. Initially it showed better results than TEI right away, but further optimizations couldn't improve it.

Wanted to try putting NPU to work for embedding generation. Every Intel system has one now and nobody uses it. Supposedly it's this special processor "for all things AI." Started investigating how to leverage it. Turned out all roads lead to OpenVINO (OVMS). Read that Intel makes it themselves, that it can use CPU/GPU/NPU/iGPU, and it's generally awesome. Started digging in.

So here's what happened with OVMS in practice:

- A giant open-source monster assembled from a bunch of components with its own ancient history (I swear I saw libs for CP/M in there). Each part builds its own usual way, everything on patches, transformations, path forwarding, and it takes at least two hours to build (and definitely not on the first try).
- CUDA support is unofficial, my architecture isn't there, only builds with ancient CUDA toolkit / VS toolkit versions. Spent half a day trying to rebuild with the new toolkit (wrote code patches that patched what was needed during compilation). Managed to rebuild, it launched, but something went wrong deep inside and I didn't dig further.
- NPU was also hard to get running. Needed the right drivers and the right alignment of the planets. Right conversion, right model precision. After finally launching, turned out you also need specially adapted NPU models. Of the "NPU models" list, exactly one actually ran and delivered an impressive 27emb/s.
- Running CPU/GPU/NPU/iGPU meant you could only run on ONE of them. Not all at once.

But I didn't give up, because when the main GPU is busy with something else (LLM for example), OVMS remains the only alternative for generating embeddings. Set up multi-model on a single server (without NPU), load balancing between them, learned to properly feed this whole zoo with batches in the right format. And managed to squeeze out almost 800emb/s. Workable. Once good NPU models arrive, should be able to pull over 1000emb/s I reckon.

Then I also tried llama.cpp in a similar fashion. It delivered the same 800emb/s without much hassle but hogging the scarce GPU. Why bother if TEI can do way more on the same hardware?

## Indexes

Initially the indexes were built into sqlite-vec / vectorlite / libsql. Then I decided to speed up their generation (it took significant time). Learned that dedicated index generators exist, even with GPU acceleration. After various experiments, settled on FAISS (in a separate node process) with an HNSW index. Fast, but sadly can't be incrementally modified — only recreated.

A bit later I discovered the IVF index (an order of magnitude better), but it required pre-training. Really wanted it. Managed to seamlessly integrate training into the process and now IVF works great.

Any changes trigger re-indexing on the fly.

## Databases

Originally I inherited sqlite-vec. But it started lagging on large databases. Tried vectorlite — better on large ones, slower than sqlite-vec on small ones. Made it adaptive based on database size.

After deciding to move to an external index, needed a new solution. Found libSQL and was quite happy with it. Until the next optimization round...

At some point I had this simple thought: "Why do I need multi-client support, transactions, WAL, and all that — when I always have just one client?" That's when I started disabling all the concurrency stuff and speed DRAMATICALLY INCREASED.

A bit later I thought it through to the end — "why do I need fancy libSQL if I'm not using its fancy features?" — and switched to native bun:sqlite. Speed DRAMATICALLY INCREASED again.

## Tools

Basic tools were there from the start, I just cleaned them up.

Then I started inventing tools that would be useful to me "right here and now." And started combining them too. For example, I built a linting tool. But why would I manually call it after every change? Added it to the chain of all tools that modify something. If a change breaks something — you get a hello from the linter with details at the end of the MCP response.

**semantic_search** — The AI gets a prompt from the user and until it scans the codebase, it doesn't know what exactly to look for. This tool lets it just say keywords and my engine returns references to what's needed. It considers not just semantically similar words, but also looks in comments, documentation (linked to the right code), finds related words on the same topic, does a second pass with those too. Then weighs everything and returns the most reliable results. Other search tools are for more specific queries.

**analyze_code_impact** — Often you wonder: what happens if I touch this thing in the code? This tool figures out what will happen. Checks all dependencies and reports back.

**analyze_state_chaos** — There's code that, you know, looks like a ball of yarn in a bag of kittens. You never know where it starts, ends, or how it's all connected. This tool helps find those weird interdependencies and untangle them. Mostly relevant for UI code with cross-component interactions, effects, subscriptions, signals.

**analyze_api_impact** — Checks correctness of all external contracts and their alignment with code. Usually these questions are off the radar for analyzers. But in my projects it's super relevant so I built it.

**detect_patterns** — I started collecting "human mistakes" in programming and built a code analyzer that finds them. Sure, there's some amount of false positives (1-5%). But nothing like what I got trying Codacy — there I just decided to close the tab and not look at 7,693 hypothetical issues.

**taint_analysis** — Important security topic. Constantly need to check yourself. Better to run these checks yourself in a clear format on your own code.

**trace-*** — A set of static tracing tools. We humans do this with our eyes and brains, but when there's a lot of data — we can't. AI agents do it 50% poorly and 50% unreliably. I specifically built a tool with sufficient granularity. It won't give a ready-made solution on a silver platter, but it massively narrows the context for the AI agent's further work. Savings of sometimes tens of millions of tokens!

**get_architecture_diagram** — If something's unclear — visualize it!

**modify_code** and others — Quick ways for the AI agent to change something without having to aim line by line and double-check the result. If anything goes wrong — the change analyzers in the tail of the message will report problems. And again — you can change calls across all code locations at once. With a single command.

**prolly tree** — All data has another dimension — time. Every change is saved. And this fact then participates in analysis, so you can immediately say — "this stacktrace appeared after a change an hour ago to this object." The tool can't tell you the cause (that's for the AI agent to figure out), but it helps find the facts.

**semantic_merge** — Every time some complex merge comes up, I dread everything that's about to happen. So I built a smart helper — it first identifies safe files for merging, then suspicious ones (digs deeper there), and resolves conflicts using semantics.

Implementing all these tools required significantly expanding the structures that parsers need to extract. And this work will probably continue. There's still a lot of inconvenience in working with AI agents.

## AUTODOC

I realized that for an AI agent, it's important to get the right description in a short form clearly tied to specific code. Reading some abstract documents somewhere far away and trying to figure out how they relate to these lines of code is really hard and often impossible. Stuffing all documentation into code is also a bad solution. You bloat code and tokens for nothing, and where would you put abstracts for an entire source directory?

I came up with this solution — in each directory, local documentation is automatically created and kept up to date. It always has a basic description and references to code entities one level down. When code changes, all these references are automatically synced. You can write any description text — it'll stay as long as it's relevant. If something changes — the LLM will fix it as needed.

Activation mode — creating a **.autocode** folder in the project root. You can put any of your own documentation in this folder too. Text there won't be auto-corrected, but references to code lines and files will be synced.



## The Story Continues

This is a very brief description of my journey. I built this project solo in my spare time.

From a simple manual tool with 240-second indexing, I arrived at an ultra-advanced solution that extracts 8x more entities from the same code — in just 4 seconds (direct speedup x60, counting completeness — x480). And the project is in TS with a bunch of architectural constraints and wild overhead.

I believe this result was only possible because I was developing this tool with itself. First time the AI agent had so few problems. And Opus 4.5+ helped a lot.

I'm really enjoying the puzzles at this level 8-)

P.S. Already in the process of rewriting the project in Zig.
Preliminary testing shows a 10x speedup and reduction in resource consumption.
