package com.trafficflow.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

/**
 * Defines the managed thread architecture. The headline budget is ~30 threads:
 *
 * <pre>
 *   workerThreads (24)   parallel plan-phase compute pool      "traffic-worker-*"
 *   1                    fixed-rate tick scheduler + commit     "sim-clock"
 *   1                    traffic-signal phase machine           "signal-controller"
 *   1                    emergency detection + preemption       "emergency-dispatcher"
 *   1                    density management (spawn requests)     "vehicle-spawner"
 *   1                    stats roll-up                           "stats-aggregator"
 *   1                    STOMP broadcast offload                 "world-broadcaster"
 *   -----------------------------------------------------------------------------
 *   30 total
 * </pre>
 *
 * Safety of this design: only the {@code sim-clock} thread mutates world state, during the
 * single-threaded commit phase. The worker pool and all service threads only read the
 * published immutable {@code WorldSnapshot}, write to their own {@code Atomic*} handoffs, or
 * enqueue commands onto thread-safe queues. There is no shared mutable state touched
 * concurrently, hence no data races and no lock cycles.
 */
@Configuration
public class ThreadPoolConfig {

    public static final int SERVICE_THREADS = 6; // clock + signal + emergency + spawner + stats + broadcaster

    private final SimulationProperties props;

    public ThreadPoolConfig(SimulationProperties props) {
        this.props = props;
    }

    @Bean(name = "workerPool")
    public ExecutorService workerPool() {
        return Executors.newFixedThreadPool(
                props.getWorkerThreads(),
                new NamedThreadFactory("traffic-worker", true));
    }

    @Bean(name = "simClock")
    public ScheduledExecutorService simClock() {
        return Executors.newSingleThreadScheduledExecutor(
                new NamedThreadFactory("sim-clock", true));
    }

    @Bean(name = "signalExecutor")
    public ScheduledExecutorService signalExecutor() {
        return Executors.newSingleThreadScheduledExecutor(
                new NamedThreadFactory("signal-controller", true));
    }

    @Bean(name = "emergencyExecutor")
    public ScheduledExecutorService emergencyExecutor() {
        return Executors.newSingleThreadScheduledExecutor(
                new NamedThreadFactory("emergency-dispatcher", true));
    }

    @Bean(name = "spawnerExecutor")
    public ScheduledExecutorService spawnerExecutor() {
        return Executors.newSingleThreadScheduledExecutor(
                new NamedThreadFactory("vehicle-spawner", true));
    }

    @Bean(name = "statsExecutor")
    public ScheduledExecutorService statsExecutor() {
        return Executors.newSingleThreadScheduledExecutor(
                new NamedThreadFactory("stats-aggregator", true));
    }

    @Bean(name = "broadcastExecutor")
    public ExecutorService broadcastExecutor() {
        return Executors.newSingleThreadExecutor(
                new NamedThreadFactory("world-broadcaster", true));
    }

    /** Total number of managed threads in the architecture (reported live in stats). */
    public int managedThreadCount() {
        return props.getWorkerThreads() + SERVICE_THREADS;
    }
}
