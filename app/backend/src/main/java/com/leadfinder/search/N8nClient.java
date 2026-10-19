package com.leadfinder.search;

import com.leadfinder.config.AppProperties;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
public class N8nClient {
    public record Draft(String subject, String body) {}

    /** Contact details found for one business by the on-demand lookup. */
    public record Enrichment(String website, List<String> emails, List<String> phones, List<String> social,
                             List<String> sources, String note) {}

    private final AppProperties props;
    private final RestClient trigger;
    private final RestClient draft;

    public N8nClient(AppProperties props) {
        this.props = props;
        this.trigger = client(Duration.ofSeconds(15));
        this.draft = client(Duration.ofSeconds(60)); // the AI writes the message while we wait
    }

    private static RestClient client(Duration readTimeout) {
        // HTTP/1.1 only: the JDK client's default h2c upgrade makes POSTs to n8n hang.
        HttpClient jdk = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
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

        trigger.post()
                .uri(props.n8n().webhookUrl())
                .header("X-Webhook-Secret", props.n8n().webhookSecret())
                .body(payload)
                .retrieve()
                .toBodilessEntity();
    }

    /** Asks the n8n "enrich-contact" workflow to look for contact details; it answers when done. */
    public Enrichment enrich(Map<String, Object> request) {
        return draft.post()
                .uri(props.n8n().enrichUrl())
                .header("X-Webhook-Secret", props.n8n().webhookSecret())
                .body(request)
                .retrieve()
                .body(Enrichment.class);
    }

    /** Asks the n8n "draft-message" workflow to write one message; it answers when the AI is done. */
    public Draft draft(Map<String, Object> request) {
        return draft.post()
                .uri(props.n8n().draftUrl())
                .header("X-Webhook-Secret", props.n8n().webhookSecret())
                .body(request)
                .retrieve()
                .body(Draft.class);
    }
}
