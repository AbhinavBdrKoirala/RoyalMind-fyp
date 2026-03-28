const DEFAULT_WORKER_URL = new URL("../../node_modules/stockfish/bin/stockfish-18-lite-single.js", import.meta.url);

export function createStockfishCoach({ onStatus } = {}) {
    let worker = null;
    let ready = false;
    let readyPromise = null;
    let readyResolve = null;
    let readyReject = null;
    let activeJob = null;
    let queuedJob = null;

    function emitStatus(text, tone = "idle") {
        if (typeof onStatus === "function") {
            onStatus({ text, tone });
        }
    }

    function post(command) {
        if (worker) {
            worker.postMessage(command);
        }
    }

    function clearWorkerState() {
        if (worker) {
            worker.removeEventListener("message", handleMessage);
            worker.removeEventListener("error", handleError);
            worker.terminate();
            worker = null;
        }

        ready = false;
        readyPromise = null;
        readyResolve = null;
        readyReject = null;
    }

    function startJob(job) {
        activeJob = job;
        emitStatus(`Analyzing ${job.sideToMove === "w" ? "White" : "Black"} to move`, "active");
        post(`setoption name MultiPV value ${job.multiPv}`);
        post(`position fen ${job.fen}`);
        post(`go depth ${job.depth}`);
    }

    function finishActiveJob(bestMove) {
        const finishedJob = activeJob;
        activeJob = null;

        if (finishedJob && !finishedJob.cancelled) {
            finishedJob.resolve({
                fen: finishedJob.fen,
                sideToMove: finishedJob.sideToMove,
                bestMove,
                depth: finishedJob.depth,
                lines: serializeLines(finishedJob.lines)
            });
        }

        if (queuedJob) {
            const nextJob = queuedJob;
            queuedJob = null;
            startJob(nextJob);
            return;
        }

        emitStatus(ready ? "Engine ready" : "Starting engine", ready ? "ready" : "pending");
    }

    function handleMessage(event) {
        const line = typeof event.data === "string" ? event.data.trim() : "";
        if (!line) return;

        if (line === "uciok") {
            post("isready");
            return;
        }

        if (line === "readyok") {
            ready = true;
            emitStatus("Engine ready", "ready");
            if (readyResolve) {
                readyResolve();
                readyResolve = null;
                readyReject = null;
            }
            return;
        }

        if (line.startsWith("info ")) {
            updateActiveJobFromInfo(line);
            return;
        }

        if (line.startsWith("bestmove ")) {
            const bestMove = line.split(/\s+/)[1] || null;
            finishActiveJob(bestMove);
        }
    }

    function handleError(error) {
        emitStatus("Engine unavailable", "danger");

        const pendingReadyReject = readyReject;
        clearWorkerState();

        if (pendingReadyReject) {
            pendingReadyReject(error);
        }

        if (activeJob) {
            activeJob.reject(error);
            activeJob = null;
        }

        if (queuedJob) {
            queuedJob.reject(error);
            queuedJob = null;
        }
    }

    function ensureWorker() {
        if (worker && readyPromise) {
            return readyPromise;
        }

        emitStatus("Starting engine", "pending");

        readyPromise = new Promise((resolve, reject) => {
            readyResolve = resolve;
            readyReject = reject;
        });

        worker = new Worker(DEFAULT_WORKER_URL);
        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        post("uci");

        return readyPromise;
    }

    function updateActiveJobFromInfo(line) {
        if (!activeJob) return;

        const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
        const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?){0,7})/);
        if (!scoreMatch || !pvMatch) return;

        const multiPvMatch = line.match(/\bmultipv (\d+)/);
        const depthMatch = line.match(/\bdepth (\d+)/);
        const lineDepth = Number(depthMatch?.[1] || 0);
        const multiPv = Number(multiPvMatch?.[1] || 1);

        activeJob.lines.set(multiPv, {
            multiPv,
            depth: lineDepth,
            scoreType: scoreMatch[1],
            scoreValue: Number(scoreMatch[2]),
            pv: pvMatch[1].trim().split(/\s+/)
        });
    }

    function serializeLines(linesMap) {
        return Array.from(linesMap.values())
            .sort((left, right) => left.multiPv - right.multiPv);
    }

    async function analyze({ fen, depth = 11, multiPv = 3 }) {
        await ensureWorker();

        return new Promise((resolve, reject) => {
            const job = {
                fen,
                depth,
                multiPv,
                sideToMove: fen.split(" ")[1] || "w",
                lines: new Map(),
                resolve,
                reject,
                cancelled: false
            };

            if (queuedJob) {
                queuedJob.reject(new Error("Analysis superseded"));
                queuedJob = null;
            }

            if (activeJob) {
                queuedJob = job;
                activeJob.cancelled = true;
                post("stop");
                return;
            }

            startJob(job);
        });
    }

    function stop() {
        if (queuedJob) {
            queuedJob.reject(new Error("Analysis stopped"));
            queuedJob = null;
        }

        if (activeJob) {
            const stoppedJob = activeJob;
            activeJob.cancelled = true;
            activeJob = null;
            post("stop");
            stoppedJob.reject(new Error("Analysis stopped"));
        }
    }

    function dispose() {
        stop();
        clearWorkerState();
        emitStatus("Engine offline", "idle");
    }

    return {
        analyze,
        dispose,
        stop
    };
}
