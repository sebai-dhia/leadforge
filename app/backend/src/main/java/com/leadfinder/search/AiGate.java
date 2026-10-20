package com.leadfinder.search;

import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Lets one message be written at a time, with a short pause after each. The free Gemini tier allows 15 requests per
 * minute for the whole key, and a message can use two. Without this, a few people writing at once (or one person
 * clicking quickly) are refused with "too many requests" and every message waits through the retries. Waiting here
 * is cheaper: the person sees a progress text instead of a slow, failing answer.
 */
@Component
public class AiGate {
    /** Raised when too many messages are already waiting for their turn. */
    public static class BusyException extends RuntimeException {
        public BusyException() { super("Too many messages are being written right now"); }
    }

    private static final long PAUSE_MS = 4_000;
    private static final long MAX_WAIT_SECONDS = 90;

    private final ReentrantLock lock = new ReentrantLock(true);
    private long lastFinished;

    public <T> T run(Supplier<T> job) {
        boolean got;
        try {
            got = lock.tryLock(MAX_WAIT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusyException();
        }
        if (!got) {
            throw new BusyException();
        }
        try {
            long wait = lastFinished + PAUSE_MS - System.currentTimeMillis();
            if (wait > 0) {
                Thread.sleep(wait);
            }
            return job.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusyException();
        } finally {
            lastFinished = System.currentTimeMillis();
            lock.unlock();
        }
    }
}
