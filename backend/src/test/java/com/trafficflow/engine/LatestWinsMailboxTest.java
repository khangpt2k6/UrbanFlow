package com.trafficflow.engine;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LatestWinsMailboxTest {

    @Test
    void slowConsumerOnlySeesFreshItemsAndNeverLosesTheLast() throws Exception {
        ExecutorService exec = Executors.newSingleThreadExecutor();
        List<Integer> seen = new ArrayList<>();
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        LatestWinsMailbox<Integer> box = new LatestWinsMailbox<>(exec, i -> {
            if (i == 0) {
                firstStarted.countDown();
                try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            synchronized (seen) { seen.add(i); }
        });

        box.offer(0);
        assertTrue(firstStarted.await(2, TimeUnit.SECONDS));
        // consumer is stuck on item 0: everything offered now collapses into the single slot
        for (int i = 1; i <= 1000; i++) box.offer(i);
        release.countDown();
        exec.shutdown();
        assertTrue(exec.awaitTermination(2, TimeUnit.SECONDS));

        assertEquals(List.of(0, 1000), seen, "only the in-flight item and the newest one are delivered");
        assertEquals(999, box.droppedCount());
    }

    @Test
    void concurrentProducersNeverQueueMoreThanOneDrain() throws Exception {
        AtomicInteger scheduled = new AtomicInteger();
        AtomicInteger delivered = new AtomicInteger();
        ExecutorService real = Executors.newSingleThreadExecutor();
        LatestWinsMailbox<Integer> box = new LatestWinsMailbox<>(r -> {
            scheduled.incrementAndGet();
            real.execute(r);
        }, i -> delivered.incrementAndGet());

        ExecutorService producers = Executors.newFixedThreadPool(4);
        for (int p = 0; p < 4; p++) {
            producers.execute(() -> { for (int i = 0; i < 20_000; i++) box.offer(i); });
        }
        producers.shutdown();
        assertTrue(producers.awaitTermination(10, TimeUnit.SECONDS));
        real.shutdown();
        assertTrue(real.awaitTermination(5, TimeUnit.SECONDS));

        // every scheduled drain delivers exactly one item, and each offer is delivered or dropped
        assertEquals(scheduled.get(), delivered.get());
        assertEquals(80_000, delivered.get() + box.droppedCount());
    }
}
