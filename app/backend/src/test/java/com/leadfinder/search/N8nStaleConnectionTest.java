package com.leadfinder.search;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

import java.io.EOFException;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class N8nStaleConnectionTest {
    private static ResourceAccessException stale() {
        return new ResourceAccessException("I/O error", new IOException("HTTP/1.1 header parser received no bytes", new EOFException("EOF reached while reading")));
    }

    @Test
    void aRequestThatNeverReachedN8nIsSentOnceMore() {
        AtomicInteger calls = new AtomicInteger();
        String result = N8nClient.retryOnStaleConnection(() -> {
            if (calls.incrementAndGet() == 1) throw stale();
            return "ok";
        });
        assertEquals("ok", result);
        assertEquals(2, calls.get());
    }

    @Test
    void otherFailuresAreNotRetriedAndASecondStaleFailureIsPassedOn() {
        AtomicInteger calls = new AtomicInteger();
        assertThrows(ResourceAccessException.class, () -> N8nClient.retryOnStaleConnection(() -> {
            calls.incrementAndGet();
            throw new ResourceAccessException("timeout", new java.net.SocketTimeoutException("Read timed out"));
        }));
        assertEquals(1, calls.get(), "a timeout may mean n8n already worked on it");

        calls.set(0);
        assertThrows(ResourceAccessException.class, () -> N8nClient.retryOnStaleConnection(() -> {
            calls.incrementAndGet();
            throw stale();
        }));
        assertEquals(2, calls.get(), "tried once more, then given up");
    }
}
