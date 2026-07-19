import unittest

from scripts.build_handbook import (
    _split_long_paragraph as split_p1_paragraph,
    build_chapters_and_html as build_p1,
)
from scripts.build_handbook_p3 import (
    _indent_level,
    _split_long_paragraph as split_p3_paragraph,
    build_chapters_and_html as build_p3,
    render_paragraph,
)


class HandbookIndentTest(unittest.TestCase):
    def test_pdf_x_positions_map_to_bounded_indent_levels(self) -> None:
        self.assertEqual(_indent_level(68.1), 0)
        self.assertEqual(_indent_level(104.8), 1)
        self.assertEqual(_indent_level(141.6), 2)
        self.assertEqual(_indent_level(178.4), 3)
        self.assertEqual(_indent_level(333.9), 3)

    def test_paragraph_uses_first_line_indent_for_wrapped_content(self) -> None:
        html = render_paragraph(
            [("(i) 受養人的生活開支；", 141.6), ("續行內容。", 178.4)],
            False,
        )
        self.assertEqual(
            html,
            '<p class="handbook-indent-2">(i) 受養人的生活開支；續行內容。</p>',
        )

    def test_baseline_paragraph_has_no_indent_class(self) -> None:
        html = render_paragraph([("一般正文。", 68.1)], False)
        self.assertEqual(html, "<p>一般正文。</p>")

    def test_long_paragraph_does_not_leave_short_reference_fragment(self) -> None:
        text = (
            "(e)保單所有人違反責任："
            + "甲" * 130
            + "（詳情見\x01B\x014.\x01/B\x01\x01B\x012\x01/B\x01段）。"
        )
        html = render_paragraph([(text, 104.8)], False)
        self.assertNotIn(
            '</p><p class="handbook-indent-1"><strong>2</strong>段）。</p>',
            html,
        )
        self.assertIn("<strong>4.</strong><strong>2</strong>段）。", html)

    def test_p3_long_paragraph_formats_lettered_items_on_separate_lines(self) -> None:
        text = (
            "(v) 利益說明文件應就下列年度提供利益說明："
            "a. 顯示不少於30年；及b. 在65歲時；及"
            "c. 在100歲時；及d. 在保單年期屆滿時。"
        )
        html = render_paragraph([(text, 178.4)], False)
        self.assertIn("：<br>a. 顯示不少於30年", html)
        self.assertIn("；及<br>b. 在65歲時", html)
        self.assertIn("；及<br>c. 在100歲時", html)
        self.assertIn("；及<br>d. 在保單年期屆滿時。", html)

    def test_p3_long_paragraph_keeps_lettered_list_item_together(self) -> None:
        inner_html = (
            "(iii) 利益說明文件只應顯示在保單年度終結時的數字，"
            + "甲" * 130
            + "；及d. 在保單年期屆滿時。"
        )
        chunks = split_p3_paragraph(inner_html)
        html = "</p><p>".join(chunks)
        self.assertNotIn("及d.</p><p> 在保單年期屆滿時。", html)
        self.assertIn("及d. 在保單年期屆滿時。", html)

    def test_p1_long_paragraph_keeps_section_reference_together(self) -> None:
        inner_html = "甲" * 130 + "（見下文<strong>3.</strong><strong>2</strong>）。"
        chunks = split_p1_paragraph(inner_html)
        html = "</p><p>".join(chunks)
        self.assertNotIn("<strong>3.</strong></p><p><strong>2</strong>", html)
        self.assertIn("<strong>3.</strong><strong>2</strong>）。", html)

    def test_consecutive_periods_are_not_split(self) -> None:
        inner_html = "甲" * 130 + "都會說「是的，不過.....」。換句話說。"
        html = "</p><p>".join(split_p3_paragraph(inner_html))
        self.assertNotIn("不過.</p><p>....", html)
        self.assertIn("不過.....」。", html)

    def test_url_period_is_not_split(self) -> None:
        inner_html = "甲" * 130 + "詳見https://hkbedc.icac.hk/insurance。"
        html = "</p><p>".join(split_p1_paragraph(inner_html))
        self.assertNotIn("hkbedc.</p><p>icac", html)
        self.assertIn("https://hkbedc.icac.hk/insurance", html)

    def test_normal_english_period_can_still_split(self) -> None:
        inner_html = "A" * 130 + ". Next sentence."
        chunks = split_p1_paragraph(inner_html)
        self.assertGreater(len(chunks), 1)

    def test_p3_starts_quoted_numbered_question_in_new_paragraph(self) -> None:
        pages = [(121, [
            ("模擬試題", "模擬試題", 68.1),
            ("「甲」類問題", "「甲」類問題", 68.1),
            (
                "1 「保險公司承諾當被保險人死亡時支付保險金的保險。」這段引述是：",
                "1 「保險公司承諾當被保險人死亡時支付保險金的保險。」這段引述是：",
                68.1,
            ),
        ])]
        _, html = build_p3(pages)
        self.assertIn(
            "<p>「甲」類問題</p>\n<p>1 「保險公司承諾當被保險人死亡時支付保險金的保險。」這段引述是：</p>",
            html,
        )

    def test_p3_carries_entire_paragraph_across_page(self) -> None:
        pages = [
            (41, []),
            (42, [("第三章 測試", "第三章 測試", 68.1), ("前文保險人拒", "前文保險人拒", 68.1), ("絕申請，因他毋須倚", "絕申請，因他毋須倚", 68.1)]),
            (43, [("賴輔助器材也能工作。", "賴輔助器材也能工作。", 68.1)]),
        ]
        _, html = build_p3(pages)
        self.assertIn("前文保險人拒絕申請，因他毋須倚賴輔助器材", html)
        self.assertNotIn("毋須倚</p>", html)

    def test_p3_does_not_carry_into_structural_line(self) -> None:
        pages = [
            (42, [("第三章 測試", "第三章 測試", 68.1), ("未完文字", "未完文字", 68.1)]),
            (43, [("(a) 新項目。", "(a) 新項目。", 68.1)]),
        ]
        _, html = build_p3(pages)
        self.assertIn("未完文字</p>", html)
        self.assertIn(">(a) 新項目。</p>", html)

    def test_p3_separates_lettered_subheadings_from_indented_body(self) -> None:
        pages = [(51, [
            ("第三章 測試", "第三章 測試", 68.1),
            ("(a) 背景", "(a) 背景", 110.66),
            ("自願醫保計劃。", "自願醫保計劃。", 153.14),
            ("(b) 自願醫保下的稅務扣減", "(b) 自願醫保下的稅務扣減", 110.66),
            ("隨着《2018年稅務條例》實施。", "隨着《2018年稅務條例》實施。", 153.14),
            ("(c) 自願醫保的管理", "(c) 自願醫保的管理", 110.66),
            ("自願醫保由食衞局管理。", "自願醫保由食衞局管理。", 153.14),
        ])]
        _, html = build_p3(pages)
        for heading in (
            "(a) 背景",
            "(b) 自願醫保下的稅務扣減",
            "(c) 自願醫保的管理",
        ):
            self.assertIn(
                f'<p class="handbook-indent-1">{heading}</p>\n'
                '<p class="handbook-indent-2">',
                html,
            )
        self.assertNotIn("背景自願醫保計劃", html)
        self.assertNotIn("稅務扣減隨着", html)
        self.assertNotIn("管理自願醫保由", html)

    def test_p3_keeps_inline_lettered_item_in_one_paragraph(self) -> None:
        pages = [(51, [
            ("第三章 測試", "第三章 測試", 68.1),
            ("(a) 標籤及正文。", "(a) 標籤及正文。", 110.66),
            ("下一段。", "下一段。", 153.14),
        ])]
        _, html = build_p3(pages)
        self.assertIn(
            '<p class="handbook-indent-1">(a) 標籤及正文。下一段。</p>',
            html,
        )

    def test_p3_merges_wrapped_heading(self) -> None:
        pages = [(42, [
            ("第三章 測試", "第三章 測試", 68.1),
            ("3.1 殘疾保險利益", "3.1 殘疾保險利益", 68.1),
            ("3.1.1 豁免保費附約（即豁免保費附", "3.1.1 豁免保費附約（即豁免保費附", 68.1),
            ("約(WP Benefit Rider)）", "約(WP Benefit Rider)）", 104.8),
            ("正文。", "正文。", 68.1),
        ])]
        chapters, html = build_p3(pages)
        title = next(ch["title"] for ch in chapters if ch["id"] == "ch-3-1-1")
        self.assertEqual(title, "豁免保費附約（即豁免保費附約(WP Benefit Rider)）")
        self.assertNotIn(">約(WP Benefit Rider)）", html)

    def test_p1_merges_ascii_wrapped_heading(self) -> None:
        pages = [(57, [
            ("第五章 測試", "第五章 測試"),
            ("5.5 測試", "5.5 測試"),
            ("5.5.1 香港保險業聯會（Hong Kong Federation of Insurers", "5.5.1 香港保險業聯會（Hong Kong Federation of Insurers"),
            ("(“HKFI”))", "(“HKFI”))"),
            ("正文。", "正文。"),
        ])]
        chapters, html, _ = build_p1(pages)
        title = next(ch["title"] for ch in chapters if ch["id"] == "ch-5-5-1")
        self.assertIn("Insurers (“HKFI”))", title)
        self.assertNotIn(">(“HKFI”))</p>", html)

    def test_closed_heading_does_not_consume_body(self) -> None:
        pages = [(42, [
            ("第三章 測試", "第三章 測試", 68.1),
            ("3.1 測試", "3.1 測試", 68.1),
            ("3.1.1 完整標題(Test)", "3.1.1 完整標題(Test)", 68.1),
            ("正文。", "正文。", 68.1),
        ])]
        chapters, html = build_p3(pages)
        title = next(ch["title"] for ch in chapters if ch["id"] == "ch-3-1-1")
        self.assertEqual(title, "完整標題(Test)")
        self.assertIn("<p>正文。</p>", html)


if __name__ == "__main__":
    unittest.main()
