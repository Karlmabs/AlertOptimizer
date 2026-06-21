#!/usr/bin/env python3
"""
Présentation de soutenance (.pptx) — structure narrative + artefacts RÉELS.

Arc : problème → objectifs → architecture → démarche (illustrée par un cas
réel suivi de bout en bout : BenchmarkTest00052) → résultats → conclusion.
Fil rouge concret : un vrai fichier OWASP, l'alerte SARIF que Semgrep a
produite, le label tiers, les features — puis les résultats.

Sortie : Soutenance_AlertOptimizer.pptx
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

THIS = os.path.dirname(os.path.abspath(__file__))
SHOTS = "/tmp/n2w_shots"
OUT = os.path.join(THIS, "Soutenance_AlertOptimizer.pptx")

BG     = RGBColor(0x14, 0x14, 0x1C)
PANEL  = RGBColor(0x1E, 0x1E, 0x2A)
PANEL2 = RGBColor(0x26, 0x26, 0x34)
CODEBG = RGBColor(0x0E, 0x0E, 0x16)
FG     = RGBColor(0xF2, 0xF2, 0xF7)
MUTED  = RGBColor(0xA6, 0xA9, 0xB8)
SUBTLE = RGBColor(0x70, 0x73, 0x84)
ACCENT = RGBColor(0x34, 0xD3, 0x9A)
INFO   = RGBColor(0x53, 0xC0, 0xEE)
WARN   = RGBColor(0xE2, 0xB0, 0x55)
DANGER = RGBColor(0xF0, 0x7A, 0x70)
MONO   = "Courier New"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
SW, SH = prs.slide_width, prs.slide_height
_N = [0]


def add_slide(bg=BG):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid(); s.background.fill.fore_color.rgb = bg
    return s


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def tbox(slide, l, t, w, h, anchor=None):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame; tf.word_wrap = True
    if anchor: tf.vertical_anchor = anchor
    return tf


def srun(r, text, size, color=FG, bold=False, italic=False, font="Calibri"):
    r.text = text; r.font.size = Pt(size); r.font.color.rgb = color
    r.font.bold = bold; r.font.italic = italic; r.font.name = font


def para(tf, text, size, color=FG, bold=False, italic=False, first=False,
         align=None, bullet=False, space_after=6, font="Calibri"):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    if align: p.alignment = align
    p.space_after = Pt(space_after)
    srun(p.add_run(), ("•  " if bullet else "") + text, size, color, bold, italic, font)
    return p


def bar(slide, color=ACCENT):
    b = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, Emu(60000))
    b.fill.solid(); b.fill.fore_color.rgb = color; b.line.fill.background()


def header(slide, eyebrow, title, color=ACCENT, count=True):
    bar(slide, color)
    para(tbox(slide, Inches(0.6), Inches(0.32), Inches(12.1), Inches(0.35)),
         eyebrow.upper(), 12, SUBTLE, bold=True, first=True)
    para(tbox(slide, Inches(0.6), Inches(0.68), Inches(12.1), Inches(1.0)),
         title, 28, FG, bold=True, first=True)
    if count:
        _N[0] += 1
        para(tbox(slide, Inches(11.7), Inches(7.02), Inches(1.4), Inches(0.4)),
             f"{_N[0]}", 10, SUBTLE, first=True, align=PP_ALIGN.RIGHT)


def table(slide, headers, rows, l, t, w, h, accent_cols=(), accent_rows=(), fs=12.5):
    gf = slide.shapes.add_table(len(rows) + 1, len(headers), l, t, w, h)
    tb = gf.table
    for c, htext in enumerate(headers):
        cell = tb.cell(0, c); cell.fill.solid(); cell.fill.fore_color.rgb = PANEL2
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = cell.text_frame.paragraphs[0]
        srun(p.add_run(), htext, fs, ACCENT, bold=True)
        p.alignment = PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER
    for ri, row in enumerate(rows, start=1):
        for c, val in enumerate(row):
            cell = tb.cell(ri, c); cell.fill.solid()
            cell.fill.fore_color.rgb = PANEL if ri % 2 else BG
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            col, bold = FG, (c == 0)
            if c in accent_cols or (ri - 1) in accent_rows:
                col, bold = ACCENT, True
            srun(p.add_run(), str(val), fs, col, bold=bold)
            p.alignment = PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER
    return gf


def highlight(slide, text, top=Inches(6.2), color=ACCENT):
    box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.6), top, Inches(12.1), Inches(0.75))
    box.fill.solid(); box.fill.fore_color.rgb = PANEL
    box.line.color.rgb = color; box.line.width = Pt(1.25)
    tf = box.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    srun(p.add_run(), text, 15, FG, bold=True)


def code_panel(slide, lines, l, t, w, h, hl=(), fs=12, title=None):
    """Monospace dark panel. `lines` = list of (text) or (num, text). hl = set of line numbers to highlight."""
    box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, l, t, w, h)
    box.fill.solid(); box.fill.fore_color.rgb = CODEBG
    box.line.color.rgb = PANEL2; box.line.width = Pt(1)
    tf = box.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.2); tf.margin_top = Inches(0.12); tf.margin_right = Inches(0.15)
    first = True
    if title:
        para(tf, title, fs - 1, SUBTLE, italic=True, first=True, space_after=6, font=MONO)
        first = False
    for item in lines:
        if isinstance(item, tuple):
            num, text = item
        else:
            num, text = None, item
        on = num in hl if num is not None else False
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(1.5)
        if num is not None:
            srun(p.add_run(), f"{num:>2} ", fs, (WARN if on else SUBTLE), font=MONO)
        srun(p.add_run(), text, fs, (WARN if on else FG), bold=on, font=MONO)
    return box


def caption(slide, text, top=Inches(6.55), color=MUTED):
    para(tbox(slide, Inches(0.6), top, Inches(12.1), Inches(0.6)),
         text, 13, color, italic=True, first=True)


# ════════ 1 — Garde ════════
s = add_slide(); bar(s)
tf = tbox(s, Inches(1.0), Inches(2.1), Inches(11.3), Inches(2.6))
para(tf, "AlertOptimizer", 54, FG, bold=True, first=True, space_after=4)
para(tf, "Filtrer les faux positifs des outils SAST par apprentissage automatique", 22, ACCENT, bold=True, space_after=14)
para(tf, "Soutenance de rattrapage — re-validation sur 66 227 alertes réelles (OWASP + NIST)", 16, MUTED, italic=True)
tf2 = tbox(s, Inches(1.0), Inches(5.7), Inches(11.3), Inches(1.2))
para(tf2, "MABOU KOUAM Karl", 16, FG, bold=True, first=True, space_after=2)
para(tf2, "Master 2 — Expert en Ingénierie Informatique · École Hexagone · 2026", 14, SUBTLE)
notes(s, "Salutation. Annoncer le plan : je rappelle le problème et mes objectifs, je remontre "
         "l'architecture, puis je déroule ma démarche sur un cas réel concret, et je termine par "
         "les résultats et leur validation statistique.")

# ════════ 2 — Problème ════════
s = add_slide(); header(s, "Le problème", "L'alert fatigue tue l'utilité des outils SAST", DANGER)
tf = tbox(s, Inches(0.7), Inches(1.9), Inches(12.0), Inches(3.5))
para(tf, "Les analyseurs statiques (SAST) signalent des vulnérabilités potentielles dans le code…",
     18, FG, first=True, bullet=True, space_after=14)
para(tf, "… mais 35 % à 91 % de ces alertes sont des FAUX POSITIFS (Muske & Serebrenik, 2016)",
     18, WARN, bold=True, bullet=True, space_after=14)
para(tf, "Conséquence : les développeurs se noient, ignorent les alertes, ratent les vraies failles",
     18, FG, bullet=True, space_after=14)
highlight(s, "Objectif : filtrer le bruit SANS jeter les vraies vulnérabilités.", top=Inches(5.4), color=DANGER)
notes(s, "Poser le problème en une phrase : trop de faux positifs → les vraies failles passent inaperçues. "
         "C'est le verrou que le mémoire attaque.")

# ════════ 3 — Objectifs + critiques ════════
s = add_slide(); header(s, "Objectifs & contexte", "Mes objectifs — et les 3 critiques du jury")
tf = tbox(s, Inches(0.7), Inches(1.8), Inches(5.9), Inches(4.6))
para(tf, "Objectifs", 16, ACCENT, bold=True, first=True, space_after=8)
for t in ["Apprendre à filtrer les faux positifs SAST",
          "Préserver les vraies vulnérabilités (rappel élevé)",
          "Pipeline 100 % NumPy, auditable, sans boîte noire",
          "Valider 3 hypothèses chiffrées (H1, H2, H3)"]:
    para(tf, t, 14.5, FG, bullet=True, space_after=8)
tf2 = tbox(s, Inches(6.8), Inches(1.8), Inches(5.9), Inches(4.6))
para(tf2, "Les 3 critiques reçues (toutes justes)", 16, DANGER, bold=True, first=True, space_after=8)
for t in ["Dataset synthétique → circularité",
          "rule.id à 81,7 % → table de correspondance ?",
          "Un simple GROUP BY rule_id suffirait ?"]:
    para(tf2, t, 14.5, FG, bullet=True, space_after=10)
para(tf2, "→ J'y réponds en refaisant tout sur données réelles, et je vous le montre concrètement.",
     14.5, ACCENT, italic=True, space_after=4)
notes(s, "Recap COURT (le jury connaît déjà). Annoncer que la réponse aux 3 critiques est tissée dans "
         "la démarche : on va suivre un vrai cas de bout en bout.")

# ════════ 4 — Architecture ════════
s = add_slide(); header(s, "Architecture", "Le pipeline — un même système, 3 modules")
stages = [("Alertes\nSARIF", INFO), ("8 features", INFO), ("DBSCAN\nclusters", WARN),
          ("Random\nForest", ACCENT), ("Seuil\ngarder/filtrer", ACCENT)]
x = Inches(0.7); y = Inches(2.6); bw = Inches(2.05); bh = Inches(1.3); gap = Inches(0.42)
for i, (lab, col) in enumerate(stages):
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, bw, bh)
    box.fill.solid(); box.fill.fore_color.rgb = PANEL; box.line.color.rgb = col; box.line.width = Pt(1.5)
    tfb = box.text_frame; tfb.word_wrap = True; tfb.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tfb.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    srun(p.add_run(), lab, 14, FG, bold=True)
    if i < len(stages) - 1:
        ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x + bw + Emu(20000), y + Inches(0.5), gap - Emu(40000), Inches(0.3))
        ar.fill.solid(); ar.fill.fore_color.rgb = SUBTLE; ar.line.fill.background()
    x = Emu(int(x) + int(bw) + int(gap))
para(tbox(s, Inches(0.7), Inches(4.4), Inches(12.0), Inches(1.6)),
     "DBSCAN (ε=0,25, MinPts=3) regroupe les alertes par densité et fabrique 2 features de cluster ; "
     "le Random Forest (50 arbres, profondeur 14) estime une probabilité de faux positif ; un seuil "
     "tranche. Tout en NumPy pur — aucune dépendance, entièrement auditable.", 15, MUTED, first=True)
highlight(s, "Aucun changement algorithmique vs le mémoire — on teste LE MÊME système sur du réel.", top=Inches(6.0))
notes(s, "Remontrer l'archi. Insister : même système que le mémoire, seules les données changent. "
         "Les 2 features de cluster (cluster_fp_rate, cluster_size) sont l'apport de DBSCAN.")

# ════════ 5 — Données ════════
s = add_slide(); header(s, "Les données", "D'où viennent les 66 227 alertes")
table(s, ["Source", "Auteur des labels", "Cas", "Alertes"], [
    ["OWASP Benchmark Java v1.2", "Fondation OWASP", "2 740", "8 043"],
    ["Juliet Test Suite Java v1.3", "NIST (SARD)", "46 803", "58 184"],
    ["Total unifié", "tiers indépendants", "49 543", "66 227"],
], Inches(1.0), Inches(2.0), Inches(11.3), Inches(2.4), accent_rows=(2,))
para(tbox(s, Inches(0.7), Inches(4.7), Inches(12.0), Inches(1.6)),
     "13× le volume du mémoire initial (5 000 synthétiques). Scan par Semgrep OSS 1.162.0 "
     "(6 rulesets publics → 58 règles). Point clé : ce sont OWASP et NIST qui décident ce qui est "
     "vulnérable — pas moi.", 15, MUTED, first=True)
highlight(s, "Pour rendre ça concret, suivons UNE alerte réelle de bout en bout →", top=Inches(6.0), color=INFO)
notes(s, "Insister sur l'indépendance des labels (réponse anticipée à la circularité) et la taille. "
         "Annoncer le fil rouge : on va suivre une vraie alerte.")

# ════════ 6 — Fil rouge : le code réel ════════
s = add_slide(); header(s, "Démarche · 1/4 — le code", "Un vrai cas : BenchmarkTest00052.java", INFO)
code_panel(s, [
    (44, "SeparateClassRequest scr ="),
    (45, "        new SeparateClassRequest(request);"),
    (46, 'String param = scr.getTheValue("BenchmarkTest00052");'),
    (47, ""),
    (48, 'String sql = "{call " + param + "}";'),
    (49, ""),
    (53, "CallableStatement statement ="),
    (54, "        connection.prepareCall(sql, ...);"),
], Inches(0.8), Inches(1.9), Inches(11.7), Inches(3.4), hl={48, 54}, fs=14)
caption(s, "Une chaîne SQL est construite par concaténation (l.48) puis passée à prepareCall (l.54). "
           "Visuellement « louche » — un analyseur va réagir.", top=Inches(5.5))
notes(s, "Montrer le vrai code. Ne pas survoler : la concaténation l.48 et le prepareCall l.54 sont "
         "ce que l'outil va flaguer. C'est un fichier réel du OWASP Benchmark, pas un exemple inventé.")

# ════════ 7 — Fil rouge : l'alerte SARIF ════════
s = add_slide(); header(s, "Démarche · 2/4 — le scan", "Semgrep produit une alerte (format SARIF)", INFO)
code_panel(s, [
    '"ruleId": "gitlab.find_sec_bugs.SQL_INJECTION...',
    '            ...SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE-1",',
    '"level":  "warning",',
    '"message": "The input values included in SQL queries',
    '            need to be passed in safely..."',
    '"location": BenchmarkTest00052.java, "startLine": 54',
], Inches(0.8), Inches(1.9), Inches(11.7), Inches(2.9), fs=13.5, title="alerte SARIF (extrait réel)")
highlight(s, "Semgrep affirme : « risque d'injection SQL, ligne 54 ».", top=Inches(5.1), color=WARN)
caption(s, "Une alerte parmi 66 227. La question : est-elle réelle, ou est-ce du bruit ?", top=Inches(6.15))
notes(s, "Voici la sortie brute de l'outil, au format standard SARIF. L'outil est sûr de lui. "
         "Mais a-t-il raison ? C'est là qu'intervient le label tiers.")

# ════════ 8 — Fil rouge : le label (critique #1) ════════
s = add_slide(); header(s, "Démarche · 3/4 — le label · réponse critique #1", "OWASP tranche : c'est un FAUX POSITIF", ACCENT)
code_panel(s, [
    "# test name, category, real vulnerability, cwe",
    "BenchmarkTest00052 , sqli , false , 89",
], Inches(0.8), Inches(1.9), Inches(11.7), Inches(1.5), fs=15, title="expectedresults-1.2.csv (vérité-terrain OWASP)")
tf = tbox(s, Inches(0.8), Inches(3.7), Inches(11.7), Inches(2.0))
para(tf, "real vulnerability = false → OWASP certifie qu'il N'Y A PAS de vulnérabilité ici "
         "(l'entrée n'est pas réellement exploitable dans cette variante).", 16, FG, first=True, bullet=True, space_after=10)
para(tf, "→ L'alerte de Semgrep est donc un FAUX POSITIF. Le label vient d'OWASP, pas de moi.",
     16, ACCENT, bold=True, bullet=True)
highlight(s, "C'est la réponse à la critique « dataset synthétique » : la vérité-terrain est tierce.", top=Inches(5.9))
notes(s, "LE moment clé pour la critique #1. Le label false vient d'OWASP. Donc quand mon modèle apprend "
         "« ce type d'alerte est un FP », il apprend une vérité indépendante, pas une étiquette que j'ai posée.")

# ════════ 9 — Fil rouge : les features ════════
s = add_slide(); header(s, "Démarche · 4/4 — les features", "Ce que le modèle voit de cette alerte")
table(s, ["Feature", "Valeur (cette alerte)"], [
    ["rule.id", "SQL_INJECTION… (find_sec_bugs)"],
    ["level / severity", "warning"],
    ["source / tool", "OWASP / Semgrep OSS"],
    ["start_line", "54"],
    ["occurrenceCount (alertes/fichier)", "2"],
    ["is_taint_rule", "0 (règle à motif, pas de taint)"],
    ["cluster_fp_rate / cluster_size", "fournis par DBSCAN"],
], Inches(1.4), Inches(1.9), Inches(10.5), Inches(3.6))
caption(s, "8 features SARIF + 2 features de cluster. Aucune n'utilise le label — pas de fuite. "
           "Le RF combine ces signaux pour estimer P(faux positif).", top=Inches(5.9))
notes(s, "Le modèle ne voit que des métadonnées, jamais le label. Multiplié par 66 227 alertes, il "
         "apprend quelles combinaisons trahissent un faux positif. occurrenceCount et is_taint_rule "
         "portent un vrai signal sur le réel.")

# ════════ 10 — Grid search ════════
s = add_slide(); header(s, "Calibration", "Grid search rejoué sur réel (105 configurations)")
table(s, ["DBSCAN (ε, MinPts)", "F1"], [
    ["0,15 / 2  (meilleur)", "0,880"], ["0,25 / 3  (mémoire)", "0,868"],
], Inches(0.8), Inches(2.0), Inches(5.6), Inches(1.5), accent_rows=(0,))
table(s, ["Random Forest (n, depth)", "F1"], [
    ["100 / 20  (meilleur)", "0,880"], ["50 / 14  (mémoire)", "0,880"],
], Inches(6.9), Inches(2.0), Inches(5.6), Inches(1.5), accent_rows=(0,))
tf = tbox(s, Inches(0.7), Inches(4.0), Inches(12.0), Inches(2.2))
para(tf, "Écart mémoire vs optimum réel : +0,012 pt F1 — dans l'épaisseur de σ (0,004)",
     16, FG, first=True, bullet=True, space_after=10)
para(tf, "Meilleure config sélectionnée sur la validation (pas le test) → aucune fuite de seuil",
     16, FG, bullet=True, space_after=10)
para(tf, "Je garde les paramètres du mémoire : posture conservatrice assumée", 16, ACCENT, bold=True, bullet=True)
notes(s, "Anticipe « vos hyperparamètres sont-ils bons sur ce dataset ? ». Grid search complet rejoué, "
         "le mémoire est à 0,012 pt de l'optimum, dans la marge. Sélection sur validation. Je n'ai pas "
         "ré-optimisé pour gonfler les chiffres.")

# ════════ 11 — Résultats + baselines (critique #3) ════════
s = add_slide(); header(s, "Résultats · réponse critique #3", "Le pipeline vs les baselines (test : 33 115 alertes)")
table(s, ["Méthode", "F1", "Réduction", "ROC-AUC"], [
    ["Pipeline (DBSCAN + RF)", "0,868", "66,6 %", "0,966"],
    ["RF seul (sans DBSCAN)", "0,845", "67,2 %", "0,960"],
    ["GROUP BY rule_id (baseline jury)", "0,756", "56,4 %", "0,876"],
    ["Random / Majority", "0,481 / 0,000", "— / —", "—"],
], Inches(1.4), Inches(2.0), Inches(10.5), Inches(2.9), accent_rows=(0,))
highlight(s, "Le ML bat le GROUP BY de +11,2 pts F1. À 66 k alertes / 58 règles, l'écart est décisif.", top=Inches(5.6))
notes(s, "Réponse frontale à « un GROUP BY suffirait ». La baseline demandée est incluse, avec smoothing. "
         "À l'échelle réelle, le ML s'impose. Rappeler EXP1 : F1 0,801→0,868, réduction 44→67 % vs synthétique.")

# ════════ 12 — Importance + ablation (critique #2) ════════
s = add_slide(); header(s, "Résultats · réponse critique #2", "rule.id : 81,7 % → 51,2 % d'importance")
table(s, ["Feature", "Réel", "Synth."], [
    ["rule.id", "51,2 %", "81,7 %"], ["occurrenceCount", "20,4 %", "0,1 %"],
    ["start_line", "11,9 %", "0,1 %"], ["is_taint_rule", "5,3 %", "—"],
    ["autres (7)", "11,1 %", "18,1 %"],
], Inches(0.8), Inches(2.0), Inches(6.0), Inches(3.0), accent_rows=(0,))
tf = tbox(s, Inches(7.1), Inches(2.1), Inches(5.6), Inches(3.2))
para(tf, "Ablation décisive", 16, ACCENT, bold=True, first=True, space_after=8)
para(tf, "Sans rule.id du tout : F1 0,88 → 0,72.", 15, FG, bullet=True, space_after=8)
para(tf, "Le modèle TIENT sans la règle → ce n'est PAS une table de correspondance.",
     15, FG, bullet=True, space_after=8)
para(tf, "rule.id reste #1, mais 3 autres features portent un vrai signal.", 15, MUTED, bullet=True)
notes(s, "Je donne raison au jury : −30 pts sur rule.id. Et l'ablation prouve que ce n'est pas une "
         "lookup table : je coupe rule.id, le modèle tient à 0,72. Honnête : rule.id reste #1.")

# ════════ 13 — Significativité ════════
s = add_slide(); header(s, "Validation statistique", "Les +11,2 pts : du solide, pas du bruit")
tf = tbox(s, Inches(0.7), Inches(2.0), Inches(12.0), Inches(3.0))
para(tf, "McNemar (alerte par alerte) : pipeline a raison 4 126 fois vs 866 → χ² = 2 128, p < 0,001",
     17, FG, first=True, bullet=True, space_after=16)
para(tf, "Bootstrap (2 000 ré-échantillonnages) : +11,2 pts F1, IC95 % [10,7 ; 11,8] → exclut zéro",
     17, FG, bullet=True, space_after=16)
highlight(s, "Le pipeline corrige ~5× plus d'erreurs qu'il n'en introduit. Avantage non dû au hasard.", top=Inches(5.3))
notes(s, "Pour un juré stats : on passe d'un chiffre (+11,2) à un fait (p<0,001, IC exclut 0). Clôt "
         "définitivement la critique #3.")

# ════════ 14 — Verdicts ════════
s = add_slide(); header(s, "Bilan des hypothèses", "Verdicts H1, H2, H3")
table(s, ["Hyp.", "Critère", "Synthétique", "Réel", "Verdict"], [
    ["H1", "Réd>50 % ET Rec≥85 %", "44 %/86 %", "67 %/88 %", "VALIDÉE ✓"],
    ["H2", "ΔF1(DBSCAN) ≥ 5 pts", "−1,6 pts", "+2,3 pts", "non validée"],
    ["H3", "ΔF1(AL) ≥ 3 %", "+3,1 %", "+0,9 %", "non validée"],
], Inches(0.8), Inches(2.1), Inches(11.7), Inches(2.6), accent_rows=(0,))
highlight(s, "H1, l'hypothèse principale, passe de partielle à VALIDÉE sur données réelles.", top=Inches(5.4))
notes(s, "H1 validée = résultat majeur. H2 sous le seuil mais devient positive (+2,3 vs −1,6). H3 plafonne "
         "car le modèle démarre déjà à 0,868. Mêmes critères que le mémoire, sur réel. Honnêteté assumée.")

# ════════ 15 — Limites ════════
s = add_slide(); header(s, "Honnêteté scientifique", "Limites assumées & travaux futurs", WARN)
tf = tbox(s, Inches(0.7), Inches(1.9), Inches(6.0), Inches(4.8))
para(tf, "Limites", 16, WARN, bold=True, first=True, space_after=8)
for t in ["1 seul outil (Semgrep), 1 langage (Java)", "Features = métadonnées SARIF (pas d'AST)",
          "H2/H3 non validées (assumé et expliqué)", "Transfert zéro-shot faible entre datasets"]:
    para(tf, t, 14.5, FG, bullet=True, space_after=9)
tf2 = tbox(s, Inches(6.9), Inches(1.9), Inches(5.8), Inches(4.8))
para(tf2, "Travaux futurs", 16, ACCENT, bold=True, first=True, space_after=8)
for t in ["SpotBugs / FindSecBugs → multi-outils", "Bandit sur projets Python réels",
          "Features de contexte de code (taint)", "Pool labellisé 1 % → effet AL visible"]:
    para(tf2, t, 14.5, FG, bullet=True, space_after=9)
notes(s, "Annoncer les limites avant le jury = maîtrise. Aucune n'invalide les conclusions. Le multi-outils "
         "est la suite logique.")

# ════════ 16 — Conclusion ════════
s = add_slide(); header(s, "Conclusion", "Ce que la re-validation démontre")
tf = tbox(s, Inches(0.7), Inches(1.8), Inches(12.0), Inches(3.2))
for i, t in enumerate([
    "H1 validée : 67 % de réduction, 88 % de rappel sur 66 k alertes réelles",
    "rule.id 82 % → 51 % : la circularité est mesurée, pas masquée",
    "ML > GROUP BY de +11,2 pts F1 (p < 0,001) : plus-value décisive à l'échelle",
    "Stabilité ×5 (σ = 0,004) et reproductibilité totale",
]):
    para(tf, t, 17, FG, first=(i == 0), bullet=True, space_after=12)
highlight(s, "Reproductible : clone → Semgrep (Docker) → python full_experiment_real.py (~37 s)", top=Inches(5.6), color=INFO)
notes(s, "Posture mesurée : meilleurs résultats sur des données bien plus solides, sans masquer ce qui ne "
         "passe pas (H2/H3). Tout est rejouable en direct — transition possible vers la démo live.")

# ════════ DIVIDER BACKUP ════════
s = add_slide(PANEL); bar(s, WARN)
tf = tbox(s, Inches(1.0), Inches(2.7), Inches(11.3), Inches(2.2), anchor=MSO_ANCHOR.MIDDLE)
para(tf, "Annexes & captures de l'outil", 36, FG, bold=True, first=True, space_after=8)
para(tf, "Détails supplémentaires + filet de sécurité si la démo live n'est pas disponible.", 16, MUTED, italic=True)
notes(s, "Slides de secours : EXP complémentaires + captures. À sortir sur demande ou si le live tombe.")

# Backup content: EXP 5, 6, 7
def backup_table(title, headers, rows, sub):
    s = add_slide(); header(s, "Annexe", title, WARN, count=False)
    table(s, headers, rows, Inches(1.4), Inches(2.0), Inches(10.5), Inches(3.4))
    caption(s, sub, top=Inches(5.8))
    return s

backup_table("EXP 5 — Sensibilité au taux de FP",
    ["FP cible", "F1", "Rappel", "Réduction", "ROC"],
    [["30 %","0,902","0,916","27,7 %","0,914"],["40 %","0,874","0,887","38,2 %","0,921"],
     ["50 %","0,838","0,867","46,6 %","0,885"],["60 %","0,805","0,835","57,1 %","0,932"],
     ["70 %","0,715","0,891","55,2 %","0,920"]],
    "Comportement linéaire propre, ROC stable (0,885–0,932) — pas de zone aveugle.")
backup_table("EXP 6 — Stabilité inter-seeds",
    ["Seed","42","123","256","512","1024"],
    [["F1","0,868","0,861","0,871","0,863","0,865"],["ROC","0,966","0,962","0,966","0,965","0,958"]],
    "F1 = 0,866 ± 0,004 — variance 5× meilleure que sur synthétique.")
backup_table("EXP 7 — Sweep de seuils",
    ["Seuil","Préc.","Rappel","F1","Réduction"],
    [["0,40","0,910","0,839","0,873","70,3 %"],["0,45 (opt.)","0,879","0,865","0,872","68,3 %"],
     ["0,60","0,738","0,939","0,826","59,0 %"],["0,70","0,674","0,962","0,793","54,0 %"],
     ["0,80","0,556","0,980","0,710","43,2 %"]],
    "Point de fonctionnement ajustable : à 0,70 → 96 % de rappel, 54 % de réduction.")
backup_table("Généralisation — LODO + ablation",
    ["Train ↓ / Test →","OWASP","Juliet"],
    [["OWASP","0,766 (même)","0,493 (croisé)"],["Juliet","0,289 (croisé)","0,904 (même)"]],
    "Transfert zéro-shot faible (attendu). Sans rule.id : 0,88 → 0,72, le modèle tient.")

# Backup: screenshots
BACKUPS = [
    ("00c-accueil.png", "L'outil live — accueil : fil rouge + KPI (F1 0,868)"),
    ("13-step-pipeline.png", "Pipeline : schéma animé + DBSCAN + Random Forest"),
    ("05b-threshold.png", "Atelier seuil — slider live + matrice de confusion"),
    ("08-hyperparams.png", "Atelier hyperparamètres — ré-entraînement en direct"),
    ("06b-significance.png", "Significativité — McNemar + bootstrap"),
    ("12-alerts.png", "Explorateur d'alertes — code Java réel surligné"),
    ("09-dataset.png", "Dataset — 66 227 alertes (OWASP + Juliet)"),
    ("14-step-al.png", "Boucle d'apprentissage actif"),
]
for fname, cap in BACKUPS:
    path = os.path.join(SHOTS, fname)
    if not os.path.exists(path):
        continue
    s = add_slide(); bar(s, WARN)
    para(tbox(s, Inches(0.6), Inches(0.25), Inches(12.1), Inches(0.6)), cap, 15, FG, bold=True, first=True)
    iw, ih = Image.open(path).size
    h = Inches(6.0); w = Emu(int(int(h) * iw / ih))
    if int(w) > int(Inches(12.5)):
        w = Inches(12.5); h = Emu(int(int(w) * ih / iw))
    s.shapes.add_picture(path, Emu(int((int(SW) - int(w)) / 2)), Inches(1.1), width=w, height=h)
    notes(s, f"Backup: {cap}")

prs.save(OUT)
print(f"Saved → {OUT}")
print(f"Total slides: {len(prs.slides._sldIdLst)}")
