#!/usr/bin/env python3
"""
Génère la présentation de soutenance (.pptx) à partir du plan Slides_outline.md.
Thème sombre cohérent avec le frontend. 19 slides de contenu + notes orateur,
puis des slides BACKUP avec les captures de l'outil (filet de sécurité live).

Usage: python build_slides.py
Sortie: Soutenance_AlertOptimizer.pptx (dans ce dossier)
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

THIS = os.path.dirname(os.path.abspath(__file__))
SHOTS = "/tmp/n2w_shots"
OUT = os.path.join(THIS, "Soutenance_AlertOptimizer.pptx")

# Palette (cohérente avec le frontend)
BG       = RGBColor(0x14, 0x14, 0x1C)
PANEL    = RGBColor(0x1E, 0x1E, 0x2A)
PANEL2   = RGBColor(0x26, 0x26, 0x34)
FG       = RGBColor(0xF2, 0xF2, 0xF7)
MUTED    = RGBColor(0xA6, 0xA9, 0xB8)
SUBTLE   = RGBColor(0x70, 0x73, 0x84)
ACCENT   = RGBColor(0x34, 0xD3, 0x9A)   # emerald
INFO     = RGBColor(0x53, 0xC0, 0xEE)   # cyan
WARN     = RGBColor(0xE2, 0xB0, 0x55)   # amber
DANGER   = RGBColor(0xF0, 0x7A, 0x70)   # coral

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
SW, SH = prs.slide_width, prs.slide_height


def add_slide(bg=BG):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = bg
    return s


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def textbox(slide, l, t, w, h, anchor=None):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    if anchor:
        tf.vertical_anchor = anchor
    return tf


def set_run(r, text, size, color=FG, bold=False, italic=False, font="Calibri"):
    r.text = text
    r.font.size = Pt(size)
    r.font.color.rgb = color
    r.font.bold = bold
    r.font.italic = italic
    r.font.name = font


def para(tf, text, size, color=FG, bold=False, italic=False, first=False,
         align=None, bullet=False, space_after=6, font="Calibri"):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    if align:
        p.alignment = align
    p.space_after = Pt(space_after)
    prefix = "•  " if bullet else ""
    set_run(p.add_run(), prefix + text, size, color, bold, italic, font)
    return p


def accent_bar(slide, color=ACCENT):
    bar = slide.shapes.add_shape(1, 0, 0, SW, Emu(60000))  # thin top bar
    bar.fill.solid(); bar.fill.fore_color.rgb = color
    bar.line.fill.background()


def header(slide, eyebrow, title, color=ACCENT):
    accent_bar(slide, color)
    tf = textbox(slide, Inches(0.6), Inches(0.35), Inches(12.1), Inches(0.35))
    para(tf, eyebrow.upper(), 12, SUBTLE, bold=True, first=True)
    tf2 = textbox(slide, Inches(0.6), Inches(0.72), Inches(12.1), Inches(1.0))
    para(tf2, title, 30, FG, bold=True, first=True)


def footer(slide, n):
    tf = textbox(slide, Inches(11.6), Inches(7.0), Inches(1.5), Inches(0.4))
    para(tf, f"{n} / 19", 10, SUBTLE, first=True, align=PP_ALIGN.RIGHT)


def table(slide, headers, rows, l, t, w, h, accent_cols=(), accent_rows=()):
    nr, nc = len(rows) + 1, len(headers)
    gf = slide.shapes.add_table(nr, nc, l, t, w, h)
    tb = gf.table
    # header
    for c, htext in enumerate(headers):
        cell = tb.cell(0, c)
        cell.fill.solid(); cell.fill.fore_color.rgb = PANEL2
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = cell.text_frame.paragraphs[0]
        set_run(p.add_run(), htext, 13, ACCENT, bold=True)
        p.alignment = PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER
    # body
    for ri, row in enumerate(rows, start=1):
        for c, val in enumerate(row):
            cell = tb.cell(ri, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = PANEL if ri % 2 else BG
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            col = FG
            bold = (c == 0)
            if c in accent_cols or (ri - 1) in accent_rows:
                col = ACCENT; bold = True
            set_run(p.add_run(), str(val), 12.5, col, bold=bold)
            p.alignment = PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER
    return gf


def highlight(slide, text, top=Inches(6.2), color=ACCENT):
    box = slide.shapes.add_shape(1, Inches(0.6), top, Inches(12.1), Inches(0.7))
    box.fill.solid(); box.fill.fore_color.rgb = PANEL
    box.line.color.rgb = color; box.line.width = Pt(1)
    tf = box.text_frame; tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    set_run(p.add_run(), text, 15, FG, bold=True)


# ════════════════════════════════════════════════════════════════════
# SLIDE 1 — Garde
# ════════════════════════════════════════════════════════════════════
s = add_slide()
accent_bar(s)
tf = textbox(s, Inches(1.0), Inches(2.2), Inches(11.3), Inches(2.5))
para(tf, "AlertOptimizer", 54, FG, bold=True, first=True, space_after=4)
para(tf, "Soutenance de rattrapage", 28, ACCENT, bold=True, space_after=14)
para(tf, "Re-validation expérimentale complète sur 66 227 alertes réelles "
         "labellisées par OWASP + NIST", 18, MUTED, italic=True)
tf2 = textbox(s, Inches(1.0), Inches(5.6), Inches(11.3), Inches(1.3))
para(tf2, "MABOU KOUAM Karl", 16, FG, bold=True, first=True, space_after=2)
para(tf2, "Master 2 — Expert en Ingénierie Informatique · École Hexagone · 2026", 14, SUBTLE)
notes(s, "Salutation, contexte. Session centrée sur la critique du jury et la re-validation "
         "complète du protocole sur dataset réel. Plan en 3 temps : critique reçue → "
         "re-évaluation des 8 EXP + H1/H2/H3 sur réel → conclusion nuancée.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 2 — La critique
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Point de départ", "Trois critiques reçues, toutes pertinentes", DANGER)
tf = textbox(s, Inches(0.7), Inches(2.0), Inches(12.0), Inches(3.2))
para(tf, "Dataset synthétique → circularité (le modèle redécouvre des patterns programmés)",
     18, FG, first=True, bullet=True, space_after=14)
para(tf, "rule.id à 81,7 % d'importance → effet de table de correspondance",
     18, FG, bullet=True, space_after=14)
para(tf, "Une simple requête GROUP BY rule_id suffirait peut-être",
     18, FG, bullet=True, space_after=14)
highlight(s, "« Votre système est-il réellement testé, ou validé sur ses propres hypothèses ? »",
          top=Inches(5.3), color=DANGER)
footer(s, 2)
notes(s, "Présenter les critiques sans défensivité. Reconnaître qu'elles sont valables. "
         "Annoncer une re-validation complète : toutes les expérimentations refaites sur le réel.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 3 — Stratégie
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Réponse", "Re-validation sur des données aux labels fournis par des tiers", INFO)
tf = textbox(s, Inches(0.7), Inches(1.9), Inches(12.0), Inches(4.5))
for txt in [
    "OWASP Benchmark Java v1.2 (Fondation OWASP) : 2 740 cas → 8 043 alertes",
    "Juliet Test Suite Java v1.3 (NIST SARD) : 46 803 cas → 58 184 alertes",
    "Dataset unifié : 66 227 alertes labellisées (13× le volume du mémoire)",
    "Outil : Semgrep OSS 1.162.0, 6 rulesets publics → 58 règles uniques",
    "Vraie baseline GROUP BY avec smoothing de Laplace",
    "Tous les 8 EXP + H1/H2/H3 ré-évalués · validation sur 5 graines",
]:
    para(tf, txt, 17, FG, first=(txt.startswith("OWASP")), bullet=True, space_after=12)
footer(s, 3)
notes(s, "Insister sur l'indépendance des labels (OWASP + NIST) et la taille (13× le synthétique). "
         "Tout reproductible.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 4 — Pipeline identique
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Méthode", "Pas de redesign — c'est le même système qu'on teste")
tf = textbox(s, Inches(0.7), Inches(1.9), Inches(12.0), Inches(4.2))
for i, txt in enumerate([
    "DBSCAN (ε=0,25, MinPts=3) + Random Forest (50 arbres, profondeur 14), NumPy pur",
    "8 features SARIF du mémoire + 1 nouvelle : is_taint_rule (dérivée du rule_id)",
    "Split stratifié 10/40/50 (labeled / pool / test), comme dans le mémoire",
    "Seuil de décision choisi sur une validation interne au train — jamais sur le test",
    "Optimisations techniques uniquement — aucun changement algorithmique",
]):
    para(tf, txt, 17, FG, first=(i == 0), bullet=True, space_after=13)
highlight(s, "Si les résultats changent, c'est dû au dataset — pas au pipeline.", top=Inches(5.7))
footer(s, 4)
notes(s, "C'est exactement le même système, pas une version améliorée. Précision essentielle "
         "pour rendre les comparaisons valides.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 5 — EXP 1
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "EXP 1", "Pipeline principal — toutes les métriques améliorées")
table(s, ["Métrique", "Synthétique", "Réel (addendum)"], [
    ["F1-Score", "0,801", "0,868"],
    ["Précision", "0,749", "0,853"],
    ["Rappel", "0,861", "0,884"],
    ["Réduction des FP", "44,0 %", "66,6 %"],
    ["ROC-AUC", "0,868", "0,966"],
    ["PR-AUC", "0,852", "0,941"],
], Inches(2.0), Inches(1.9), Inches(9.3), Inches(4.2), accent_cols=(2,))
footer(s, 5)
notes(s, "Résultat inattendu : sur dataset réel indépendant, le pipeline performe MIEUX que sur "
         "synthétique. Validation forte de la robustesse — pas de surajustement au synthétique. "
         "La réduction passe de 44 % à 67 %, l'impact opérationnel le plus fort.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 6 — Baselines
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Critique #3", "Baselines — comparaison frontale (33 114 alertes, seed 42)")
table(s, ["Méthode", "F1", "Réduction", "ROC-AUC"], [
    ["Pipeline (DBSCAN + RF)", "0,868", "66,6 %", "0,966"],
    ["RF seul (sans DBSCAN)", "0,845", "67,2 %", "0,960"],
    ["GROUP BY rule_id (baseline jury)", "0,756", "56,4 %", "0,876"],
    ["Random", "0,481", "5,5 %", "—"],
    ["Majority (filtre tout)", "0,000", "100 %", "—"],
], Inches(1.4), Inches(1.9), Inches(10.5), Inches(3.4), accent_rows=(0,))
highlight(s, "Le ML bat GROUP BY de +11,2 pts F1, +10,2 pts de réduction, +9,0 pts ROC-AUC.",
          top=Inches(5.7))
footer(s, 6)
notes(s, "Slide central. La critique GROUP BY traitée frontalement avec la baseline demandée. "
         "À 66 k alertes / 58 règles, l'écart est décisif. Majority à F1=0 : avec 67,8 % de FP, "
         "filtrer tout perd tous les TP — baseline dégénéré, inclus par cohérence.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 7 — Feature importance
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "EXP 2 · Critique #2", "rule.id : 81,7 % → 51,2 % d'importance ROC")
table(s, ["Feature", "Réel", "Synthétique"], [
    ["rule.id", "51,2 %", "81,7 %"],
    ["occurrenceCount", "20,4 %", "0,1 %"],
    ["start_line", "11,9 %", "0,1 %"],
    ["is_taint_rule (ajoutée)", "5,3 %", "—"],
    ["cluster_size", "4,7 %", "0,5 %"],
    ["cluster_fp_rate", "3,5 %", "6,7 %"],
    ["autres (5 features)", "2,9 %", "9,3 %"],
], Inches(2.4), Inches(1.85), Inches(8.5), Inches(4.4), accent_rows=(0,))
footer(s, 7)
notes(s, "Le slide où je donne raison au jury le plus directement : −30 points absolus sur rule.id. "
         "Mais rule.id reste #1, je ne le masque pas. Trois features émergent : occurrenceCount, "
         "start_line, is_taint_rule.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 8 — Active Learning
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "EXP 3 & 4", "Apprentissage actif : +0,9 pt (parfait et bruité)")
table(s, ["Cycle", "F1 (parfait)", "F1 (bruité 10 %)"], [
    ["C0 (départ)", "0,868", "0,868"],
    ["C5", "0,877", "0,879"],
    ["Δ total", "+0,009", "+0,011"],
], Inches(2.4), Inches(1.9), Inches(8.5), Inches(2.2))
tf = textbox(s, Inches(0.7), Inches(4.5), Inches(12.0), Inches(2.0))
para(tf, "Critère H3 (≥ 3 %) : NON VALIDÉE sur réel", 17, WARN, bold=True, first=True, space_after=10)
para(tf, "Résultat secondaire : robustesse exceptionnelle au bruit d'oracle (Δ ≤ 0,003 sur les 5 cycles)",
     16, MUTED, bullet=True)
footer(s, 8)
notes(s, "À présenter honnêtement. H3 non validée car le modèle démarre déjà à 0,868 — effet de "
         "plafond, pas un défaut de l'AL. Le positif : le bruit d'oracle a peu d'impact → mécanisme robuste.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 9 — Sensibilité FP
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "EXP 5", "Sensibilité au taux de FP — comportement linéaire propre")
table(s, ["FP cible", "F1", "Rappel", "Réduction", "ROC-AUC"], [
    ["30 %", "0,902", "0,916", "27,7 %", "0,914"],
    ["40 %", "0,874", "0,887", "38,2 %", "0,921"],
    ["50 %", "0,838", "0,867", "46,6 %", "0,885"],
    ["60 %", "0,805", "0,835", "57,1 %", "0,932"],
    ["70 %", "0,715", "0,891", "55,2 %", "0,920"],
], Inches(1.8), Inches(1.9), Inches(9.7), Inches(3.4))
highlight(s, "À 30 % de FP, F1 = 0,902 ; ROC-AUC stable (0,885–0,932) sur toute la plage.",
          top=Inches(5.7))
footer(s, 9)
notes(s, "Comportement prévisible et stable sur toute la plage — pas de cliff effect, pas de zone "
         "aveugle. Crucial pour un déploiement où la distribution des FP varie.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 10 — Stabilité
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "EXP 6", "Stabilité inter-seeds — F1 = 0,866 ± 0,004")
table(s, ["Seed", "42", "123", "256", "512", "1024"], [
    ["F1", "0,868", "0,861", "0,871", "0,863", "0,865"],
    ["ROC", "0,966", "0,962", "0,966", "0,965", "0,958"],
], Inches(1.6), Inches(2.1), Inches(10.1), Inches(1.6))
highlight(s, "Écart-type = 0,004  (synthétique : 0,019 → ÷5 meilleur)", top=Inches(4.6))
footer(s, 10)
notes(s, "Variance 5× meilleure que sur synthétique. Le split ne change quasiment rien — argument "
         "fort pour la reproductibilité en production.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 11 — Sweep seuils
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "EXP 7", "Sweep de seuils — point de fonctionnement ajustable")
table(s, ["Seuil", "Précision", "Rappel", "F1", "Réduction"], [
    ["0,40", "0,910", "0,839", "0,873", "70,3 %"],
    ["0,45 (optimum F1)", "0,879", "0,865", "0,872", "68,3 %"],
    ["0,60", "0,738", "0,939", "0,826", "59,0 %"],
    ["0,70", "0,674", "0,962", "0,793", "54,0 %"],
    ["0,80", "0,556", "0,980", "0,710", "43,2 %"],
], Inches(1.8), Inches(1.9), Inches(9.7), Inches(3.4), accent_rows=(1,))
highlight(s, "À seuil 0,70 : on garde 96,2 % des vraies vulnérabilités et filtre 54 % du volume.",
          top=Inches(5.7))
footer(s, 11)
notes(s, "Slide opérationnel : l'organisation calibre selon sa tolérance au risque. Contexte critique "
         "→ seuil 0,80 (98 % rappel). Contexte tolérant → 0,40 (70 % réduction).")

# ════════════════════════════════════════════════════════════════════
# SLIDE 12 — Hyperparamètres
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Validation", "Hyperparamètres : grid search rejoué sur réel (105 combos)")
table(s, ["Config DBSCAN (ε, MinPts)", "F1"], [
    ["0,15 / 2  (meilleur)", "0,880"],
    ["0,25 / 3  (mémoire)", "0,868"],
], Inches(0.8), Inches(2.0), Inches(5.6), Inches(1.5), accent_rows=(0,))
table(s, ["Config RF (n_estim, depth)", "F1"], [
    ["100 / 20  (meilleur)", "0,880"],
    ["50 / 14  (mémoire)", "0,880"],
], Inches(6.9), Inches(2.0), Inches(5.6), Inches(1.5), accent_rows=(0,))
tf = textbox(s, Inches(0.7), Inches(4.0), Inches(12.0), Inches(2.4))
para(tf, "Différentiel mémoire vs optimum réel : +0,012 pt F1 — dans l'épaisseur de σ (0,004)",
     16, FG, first=True, bullet=True, space_after=10)
para(tf, "La meilleure config est sélectionnée sur la validation, pas sur le test → aucune fuite",
     16, FG, bullet=True, space_after=10)
para(tf, "Les paramètres du mémoire sont quasi-optimaux — posture conservatrice assumée",
     16, ACCENT, bold=True, bullet=True)
footer(s, 12)
notes(s, "Anticipe « vos hyperparamètres sont-ils les bons sur ce dataset ? ». Réponse documentée : "
         "le mémoire perd 0,012 pt F1 vs l'optimum, dans la marge d'erreur. Sélection sur validation "
         "(pas de fuite). Je n'ai pas ré-optimisé pour gonfler les chiffres — posture conservatrice.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 13 — Généralisation
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Critiques #1 & #2", "Généralisation : le système hors de son dataset", INFO)
table(s, ["Train ↓ / Test →", "OWASP", "Juliet"], [
    ["OWASP", "0,766 (même)", "0,493 (croisé)"],
    ["Juliet", "0,289 (croisé)", "0,904 (même)"],
], Inches(2.4), Inches(1.9), Inches(8.5), Inches(1.6))
tf = textbox(s, Inches(0.7), Inches(3.9), Inches(12.0), Inches(2.6))
para(tf, "Même dataset 0,835 · croisé 0,391 → gap +0,444 (transfert zéro-shot faible, attendu : "
         "les FP SAST sont propres au projet)", 16, FG, first=True, bullet=True, space_after=12)
para(tf, "Ablation : sans rule.id du tout, F1 = 0,88 → 0,72 → le modèle tient → "
         "ce n'est PAS une table de correspondance", 16, ACCENT, bold=True, bullet=True)
footer(s, 13)
notes(s, "Désamorce deux critiques d'un coup. Le gap LODO motive la slide suivante (adaptation). "
         "L'ablation est ma réponse la plus directe à « rule.id = table » : je le coupe, ça tient.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 14 — Adaptation
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Analyse complémentaire", "Adaptation : l'AL rattrape le cross-dataset", INFO)
table(s, ["Direction", "Zéro-shot", "AL aléatoire", "Borne haute"], [
    ["Juliet → OWASP", "0,218", "0,579 (+67 %)", "0,759"],
    ["OWASP → Juliet", "0,489", "0,750 (+66 %)", "0,885"],
], Inches(1.4), Inches(1.9), Inches(10.5), Inches(1.6), accent_cols=(2,))
tf = textbox(s, Inches(0.7), Inches(3.9), Inches(12.0), Inches(2.6))
para(tf, "Quelques centaines de labels → ~2/3 du gap récupéré. C'est la raison d'être de l'AL.",
     16, FG, first=True, bullet=True, space_after=12)
para(tf, "Résultat secondaire (3 graines) : sous changement de distribution, l'incertitude est "
         "battue par l'aléatoire — mode de défaite connu de l'AL, ici quantifié", 16, MUTED, bullet=True)
footer(s, 14)
notes(s, "Transforme la faiblesse de la slide 13 en force. J'assume le résultat contre-intuitif "
         "(incertitude < aléatoire) : ça montre que j'ai creusé. Nuance H3 honnêtement.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 15 — Significativité
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Critique #3 — clôture", "Significativité : les +11,2 pts, c'est du solide")
tf = textbox(s, Inches(0.7), Inches(2.0), Inches(12.0), Inches(3.0))
para(tf, "McNemar (alerte par alerte) : pipeline a raison 4 126 fois vs 866 pour GROUP BY "
         "→ χ² = 2 128, p < 0,001", 17, FG, first=True, bullet=True, space_after=16)
para(tf, "Bootstrap (2 000 ré-échantillonnages) : écart +11,2 pts F1, IC95 % [10,7 ; 11,8] "
         "→ l'intervalle exclut zéro", 17, FG, bullet=True, space_after=16)
highlight(s, "Le pipeline corrige ~5× plus d'erreurs qu'il n'en introduit. Pas un artefact d'échantillonnage.",
          top=Inches(5.3))
footer(s, 15)
notes(s, "LA slide pour clore la critique #3. On passe de « +11,2 pts » (un chiffre) à un fait "
         "statistique (p < 0,001, IC exclut 0). Si un juré a un profil stats, c'est là qu'on le convainc.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 16 — Verdicts
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Bilan", "Verdicts H1, H2, H3")
table(s, ["Hypothèse", "Critère", "Synthétique", "Réel", "Verdict"], [
    ["H1", "Réd>50 % ET Rec≥85 %", "44 %/86 %", "67 %/88 %", "VALIDÉE ✓"],
    ["H2", "ΔF1(DBSCAN) ≥ 5 pts", "−1,6 pts", "+2,3 pts", "non validée"],
    ["H3 parfait", "ΔF1(AL) ≥ 3 %", "+3,1 %", "+0,9 %", "non validée"],
    ["H3 bruité", "ΔF1(AL) ≥ 3 %", "+2,7 %", "+0,9 %", "non validée"],
], Inches(0.8), Inches(1.9), Inches(11.7), Inches(3.0), accent_rows=(0,))
footer(s, 16)
notes(s, "Le slide-clé. H1 (hypothèse principale) PASSE de partielle à VALIDÉE sur réel — résultat "
         "majeur. H2 sous le critère mais devient positive (+2,3 vs −1,6). H3 plafonne car le modèle "
         "démarre déjà très haut. Mêmes critères, mêmes calculs que le mémoire, sur dataset réel.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 17 — État de l'art
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Positionnement", "Comparaison avec l'état de l'art")
table(s, ["Système", "Dataset", "F1", "ROC-AUC"], [
    ["Hanam et al. 2014", "1 288 alertes FindBugs", "0,72", "—"],
    ["Russell et al. 2018", "10 000 propriétaires", "—", "0,89"],
    ["Kang et al. 2022", "8 000 alertes CodeBERT", "0,83", "—"],
    ["AlertOptimizer (mémoire)", "5 000 synthétiques", "0,801", "0,868"],
    ["AlertOptimizer (addendum)", "66 227 réelles", "0,868", "0,966"],
], Inches(1.1), Inches(1.9), Inches(11.1), Inches(3.4), accent_rows=(4,))
footer(s, 17)
notes(s, "Ne pas sur-vendre — chaque dataset diffère, comparaisons indicatives. Mais le pattern est "
         "clair : sur volume réel et système auditable, au niveau ou au-dessus des approches récentes. "
         "Sans deep learning, sans embeddings opaques.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 18 — Limites
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Honnêteté", "Limites assumées & travaux futurs", WARN)
tf = textbox(s, Inches(0.7), Inches(1.8), Inches(6.0), Inches(5.0))
para(tf, "Limites", 16, WARN, bold=True, first=True, space_after=8)
for txt in ["1 seul outil (Semgrep)", "1 seul langage (Java)",
            "Features SARIF métadonnées uniquement", "H2 et H3 non validées",
            "Transfert zéro-shot faible (assumé)"]:
    para(tf, txt, 14, FG, bullet=True, space_after=8)
tf2 = textbox(s, Inches(6.9), Inches(1.8), Inches(5.8), Inches(5.0))
para(tf2, "Travaux futurs", 16, ACCENT, bold=True, first=True, space_after=8)
for txt in ["SpotBugs+FindSecBugs → multi-tool", "Bandit sur projets Python OSS",
            "Features de contexte de code (AST, taint)", "AL avec pool labellisé 1 %"]:
    para(tf2, txt, 14, FG, bullet=True, space_after=8)
footer(s, 18)
notes(s, "Annoncer ces limites avant le jury, pour montrer la maîtrise. Aucune n'est rédhibitoire. "
         "Le multi-tool est la suite logique, listée dans l'addendum.")

# ════════════════════════════════════════════════════════════════════
# SLIDE 19 — Conclusion
# ════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Conclusion", "Apports de la re-validation")
tf = textbox(s, Inches(0.7), Inches(1.8), Inches(12.0), Inches(3.4))
for i, txt in enumerate([
    "H1 enfin validée : 67 % de réduction, 88 % de rappel sur 66 k alertes réelles",
    "rule.id 82 % → 51 % : la circularité est validée par les données, l'effet est mesurable",
    "ML > GROUP BY : +11,2 pts F1 — plus-value décisive à l'échelle",
    "Stabilité ×5 : σ(F1) = 0,004 sur 5 graines",
]):
    para(tf, txt, 17, FG, first=(i == 0), bullet=True, space_after=12)
highlight(s, "Reproductible de bout en bout : clone → Semgrep (Docker) → python full_experiment_real.py (~37 s)",
          top=Inches(5.6), color=INFO)
footer(s, 19)
notes(s, "Posture mesurée : meilleurs résultats que le mémoire, sur données bien plus solides. Garder "
         "la réflexion critique (verdicts, limites) jusqu'au bout — ne pas sur-vendre. Insister sur la "
         "reproductibilité : tout est public et rejouable en direct.")

# ════════════════════════════════════════════════════════════════════
# DIVIDER BACKUP
# ════════════════════════════════════════════════════════════════════
s = add_slide(PANEL)
accent_bar(s, WARN)
tf = textbox(s, Inches(1.0), Inches(2.8), Inches(11.3), Inches(2.0), anchor=MSO_ANCHOR.MIDDLE)
para(tf, "BACKUP — Captures de l'outil", 38, FG, bold=True, first=True, space_after=8)
para(tf, "Filet de sécurité si la démo live n'est pas disponible. "
         "Mêmes chiffres que la version interactive.", 16, MUTED, italic=True)
notes(s, "Slides de secours : à utiliser uniquement si le live tombe. Sinon, faire la démo en direct.")

# Image backup slides
BACKUPS = [
    ("00c-accueil.png", "Accueil — fil rouge (3 critiques → 3 réponses) + KPI (F1 0,868 · réduction 66,6 %)"),
    ("13-step-pipeline.png", "Étape 6 — Pipeline : schéma + DBSCAN + Random Forest (animés)"),
    ("05b-threshold.png", "Atelier seuil — slider live, matrice de confusion qui se recolore"),
    ("08-hyperparams.png", "Atelier hyperparamètres — ré-entraînement en ~3 s"),
    ("06b-significance.png", "Significativité — McNemar + bootstrap (+11,2 pts, p < 0,001)"),
    ("07-generalization.png", "Généralisation — matrice LODO + ablation rule.id"),
    ("14-step-al.png", "Étape 9 — Boucle d'apprentissage actif"),
    ("11-al-cross.png", "Adaptation cross-dataset — l'AL rattrape le gap"),
    ("12-alerts.png", "Explorateur d'alertes — 33 115 alertes, code Java surligné"),
    ("09-dataset.png", "Dataset — 66 227 alertes (OWASP Benchmark + NIST Juliet)"),
]
from PIL import Image
for fname, caption in BACKUPS:
    path = os.path.join(SHOTS, fname)
    if not os.path.exists(path):
        continue
    s = add_slide()
    accent_bar(s, WARN)
    tf = textbox(s, Inches(0.6), Inches(0.25), Inches(12.1), Inches(0.6))
    para(tf, caption, 15, FG, bold=True, first=True)
    # fit image by height, centered
    iw, ih = Image.open(path).size
    avail_h = Inches(6.0)
    h = avail_h
    w = Emu(int(int(h) * iw / ih))
    if w > Inches(12.5):
        w = Inches(12.5); h = Emu(int(int(w) * ih / iw))
    left = Emu(int((int(SW) - int(w)) / 2))
    top = Inches(1.1)
    s.shapes.add_picture(path, left, top, width=w, height=h)
    notes(s, f"Backup: {caption}")

prs.save(OUT)
print(f"Saved → {OUT}")
print(f"Total slides: {len(prs.slides._sldIdLst)}")
