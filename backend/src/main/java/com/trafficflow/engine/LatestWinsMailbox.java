package com.trafficflow.engine;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/**
 * A one-slot, latest-wins hand-off from a producer thread to a consumer running on an executor.
 *
 * <p>World snapshots are only useful while they are fresh. Handing every one to a single-thread
 * executor puts them on an unbounded queue, so a slow socket or a GC pause makes the backlog (and
 * the latency the viewer sees) grow without limit. Here the producer just swaps the newest item
 * into the slot; if the consumer is still busy with the previous one, the item it has not picked
 * up yet is overwritten and dropped. At most one drain task is queued at any time, so memory and
 * latency stay bounded no matter how slow the consumer gets.
 *
 * <p>Lock-free: the only shared state is the slot. A drain task is scheduled exactly when the slot
 * goes from empty to full, and the drain empties it, so the last item offered is never lost.
 */
public final class LatestWinsMailbox<T> {

    private final AtomicReference<T> slot = new AtomicReference<>();
    private final AtomicLong dropped = new AtomicLong();
    private final Executor executor;
    private final Consumer<T> consumer;

    public LatestWinsMailbox(Executor executor, Consumer<T> consumer) {
        this.executor = executor;
        this.consumer = consumer;
    }

    /** Offer the newest item. Never blocks; replaces (and counts as dropped) any undelivered item. */
    public void offer(T item) {
        T previous = slot.getAndSet(item);
        if (previous == null) {
            executor.execute(this::drain);
        } else {
            dropped.incrementAndGet();
        }
    }

    private void drain() {
        T item = slot.getAndSet(null);
        if (item != null) {
            consumer.accept(item);
        }
    }

    /** Items overwritten before the consumer got to them (a stale frame skipped, not an error). */
    public long droppedCount() {
        return dropped.get();
    }
}
