package com.leadfinder.usage;

/**
 * What one workflow run spent on the outside services, as n8n reports it. Any part can be missing (an older workflow, a
 * step that did not run). Gemini counts tokens; Serper and Geoapify count requests.
 */
public record ApiMeter(Part gemini, Part serper, Part geoapify) {

    public record Part(Long calls, Long inputTokens, Long outputTokens) {}
}
