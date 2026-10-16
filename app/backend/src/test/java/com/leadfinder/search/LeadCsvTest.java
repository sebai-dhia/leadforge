package com.leadfinder.search;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Lead names and addresses come from public data, so the export must be safe to open in a spreadsheet. */
class LeadCsvTest {

    @Test
    void formulaLookingTextIsNeutralised() {
        assertEquals("'=HYPERLINK(\"x\")".replace("\"", "\"\""), LeadCsv.cell("=HYPERLINK(\"x\")").replaceAll("^\"|\"$", ""));
        assertEquals("'@SUM(1+1)", LeadCsv.cell("@SUM(1+1)"));
        assertEquals("'-cmd", LeadCsv.cell("-cmd"));
        assertEquals("'+cmd|x", LeadCsv.cell("+cmd|x"));
    }

    @Test
    void realPhoneNumbersKeepTheirPlus() {
        assertEquals("+216 71 874 421", LeadCsv.cell("+216 71 874 421"));
        assertEquals("+216 (71) 874-421", LeadCsv.cell("+216 (71) 874-421"));
    }

    @Test
    void commasQuotesAndNewlinesAreQuoted() {
        assertEquals("\"12, Rue \"\"A\"\"\"", LeadCsv.cell("12, Rue \"A\""));
        assertEquals("\"a\nb\"", LeadCsv.cell("a\nb"));
        assertEquals("plain", LeadCsv.cell("plain"));
        assertEquals("", LeadCsv.cell(null));
    }

    @Test
    void fileStartsWithABomSoExcelReadsArabicCorrectly() {
        Lead l = new Lead();
        l.setName("عيادة");
        l.setScore(8);
        l.setStatus("NEW");
        byte[] bytes = LeadCsv.build(List.of(l));
        assertEquals((byte) 0xEF, bytes[0]);
        assertEquals((byte) 0xBB, bytes[1]);
        assertEquals((byte) 0xBF, bytes[2]);
        String text = new String(bytes, StandardCharsets.UTF_8);
        assertTrue(text.contains("عيادة,8,NEW"));
    }
}
