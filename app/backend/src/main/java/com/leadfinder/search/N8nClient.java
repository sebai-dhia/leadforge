package com.leadfinder.search;

import com.leadfinder.config.AppProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

@Component
public class N8nClient {
    /** promptVersion: the version of the prompt files that wrote the message. linksKnowledge and linksHash: what was read on the sender's own links, to be cached (null when not read this time). meter: what the AI calls cost (null from an older workflow). */
    public record Draft(String subject, String body, String linksKnowledge, String linksHash, String promptVersion,
                        com.leadfinder.usage.ApiMeter meter) {}

    /** Contact details found for one business by the on-demand lookup. */
    public record Enrichment(String website, List<String> emails, List<String> phones, List<String> social,
                             List<String> sources, String note, com.leadfinder.usage.ApiMeter meter) {}

    private final AppProperties props;
    private final RestClient trigger;
    private final RestClient draft;

    /**
     * wakeSeconds: extra time for an n8n host that sleeps when idle and needs a while to start again (0 when n8n is
     * always running). It is added to every wait.
     */
    public N8nClient(AppProperties props, @Value("${app.n8n.wake-seconds:0}") int wakeSeconds) {
        this.props = props;
        Duration wake = Duration.ofSeconds(wakeSeconds);
        this.trigger = client(Duration.ofSeconds(15).plus(wake), Duration.ofSeconds(5).plus(wake));
        // the AI writes the message while we wait; a second try after a rate limit can take over a minute
        this.draft = client(Duration.ofSeconds(120).plus(wake), Duration.ofSeconds(5).plus(wake));
    }

    private static RestClient client(Duration readTimeout, Duration connectTimeout) {
        // HTTP/1.1 only: the JDK client's default h2c upgrade makes POSTs to n8n hang.
        HttpClient jdk = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(connectTimeout)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(readTimeout);
        return RestClient.builder().requestFactory(factory).build();
    }

    /** n8n answers immediately (Webhook responds "When received") and calls back when finished. */
    public void trigger(SearchJob job) {
        java.util.Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("jobId", job.getId());
        payload.put("niche", NicheNormalizer.normalize(job.getNiche()));
        payload.put("city", job.getCity());
        if (job.getBbox() != null && !job.getBbox().isBlank()) {
            payload.put("bbox", job.getBbox());
        }
        payload.put("service", job.getService());
        payload.put("sender", job.getSender());
        payload.put("lookupLimit", job.getLookupLimit());
        payload.put("callbackUrl", props.publicBaseUrl() + "/api/internal/n8n/results");

        retryOnStaleConnection(() -> trigger.post()
                .uri(props.n8n().webhookUrl())
                .header("X-Webhook-Secret", props.n8n().webhookSecret())
                .body(payload)
                .retrieve()
                .toBodilessEntity());
    }

    /** Asks the n8n "enrich-contact" workflow to look for contact details; it answers when done. */
    public Enrichment enrich(Map<String, Object> request) {
        return retryOnStaleConnection(() -> draft.post()
                .uri(props.n8n().enrichUrl())
                .header("X-Webhook-Secret", props.n8n().webhookSecret())
                .body(request)
                .retrieve()
                .body(Enrichment.class));
    }

    /** Asks the n8n "draft-message" workflow to write one message; it answers when the AI is done. */
    public Draft draft(Map<String, Object> request) {
        return retryOnStaleConnection(() -> draft.post()
                .uri(props.n8n().draftUrl())
                .header("X-Webhook-Secret", props.n8n().webhookSecret())
                .body(request)
                .retrieve()
                .body(Draft.class));
    }

    /**
     * n8n closes idle connections after a few seconds, and a pooled one can be reused at that very moment:
     * the request then never reached n8n ("received no bytes"). Sending it again is safe, and only that case is retried.
     */
    static <T> T retryOnStaleConnection(Supplier<T> call) {
        try {
            return call.get();
        } catch (ResourceAccessException e) {
            if (!isStaleConnection(e)) throw e;
            return call.get();
        }
    }

    static boolean isStaleConnection(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof java.io.EOFException) return true;
            if (t.getMessage() != null && t.getMessage().contains("received no bytes")) return true;
        }
        return false;
    }
}
