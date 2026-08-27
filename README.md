# Stencil Design Report — Stentec

Gerador automático do **Stencil Design Report** a partir dos arquivos `.rpt`
exportados no fim do projeto de stencil. Substitui o fluxo manual do Power BI
(`AR.AUTOMATION_REV31.pbix`) por uma página web que roda direto no navegador.

> **Tudo local.** Os arquivos `.rpt` nunca saem da sua máquina — não há servidor,
> não há upload. O processamento é 100% JavaScript no navegador.

## Como usar

1. Abra a página publicada (GitHub Pages — veja *Publicação* abaixo).
2. Arraste um ou mais arquivos `.rpt` para a área indicada.
3. A **espessura** e a **ST** são lidas do nome do arquivo
   (`5,5st42419.rpt` → 5,5 mils · ST42419). Se o nome não seguir o padrão,
   basta digitar a espessura na tabela.
4. Se a mesma ST tiver **mais de uma espessura** (step), envie todos os `.rpt`
   juntos: o app detecta automaticamente, habilita a seção *Step Information*
   e gera a página 2. Informe **K1** e **K2** em mils e anexe as imagens de keep-out.
5. Clique em **Gerar relatório**, confira a prévia e baixe:
   - `ST#####_REPORT.pdf` — o relatório
   - `ST#####_DATAREPORT.csv` — a tabela de aberturas

### Múltiplas espessuras (step)

Não há uma pergunta em separado do tipo "tem mais espessuras?": basta soltar
todos os arquivos na área de upload (de uma vez ou aos poucos). O app mostra a
lista, soma as aberturas e avisa quantas espessuras encontrou. Enquanto houver
só uma espessura, a página 2 nem é gerada.

## Layouts

| Layout | Quando usar |
| --- | --- |
| **Fiel ao Power BI** | Mesma identidade visual do relatório atual (REV31): logo, velocímetros, posições e cores. |
| **Moderno** | Mesmos dados e fórmulas, visual mais limpo e legível. |

A opção *Linhas na tabela* controla a tabela central: **13 primeiras**
(igual ao Power BI) ou **todas** — neste caso são geradas páginas
extras de *Aperture List* com a lista completa.

## As fórmulas (IPC-7525C)

O motor (`src/engine.js`) é um porte **verificado** do modelo do Power BI.
Toda a lógica foi obtida por engenharia reversa dos `.rpt` e dos relatórios
já emitidos, e está travada por testes de regressão.

```
π  = 3.14159            ← literal usado no Power BI (não Math.PI)

Area Ratio    = (A × B) / (2 × (A + B) × T)     para TODAS as formas
Aspect Ratio  = min(A, B) / T

Área da abertura (usada só no volume):
  Round     → π × (A/2)²
  Oblong    → (a − b) × b + π × (b/2)²          formato "estádio"
  Squircle  → A × B − (4 − π) × r²              r = 3º campo do .rpt
  Outros    → A × B                             Rectangle, Square, Custom

Volume (mils³) = área × T × Qtd
Volume (cm³)   = mils³ × 1.6387064e-5 / 1000

Pasta (g)      = volume(cm³) × densidade        SAC305 = 5,23 · Sn63/Pb37 = 4,88
Five Ball Rule = min(A, B) / 5 × 25,4           em microns
```

**Detalhe importante:** o *Area Ratio* usa o modelo retangular mesmo para
círculos e oblongos (é assim que o Power BI calcula), enquanto o *volume*
usa a geometria real da abertura. Os dois comportamentos foram confirmados
contra os relatórios emitidos.

### Formas reconhecidas no `.rpt`

| Campo `Type` no `.rpt` | Forma no relatório |
| --- | --- |
| `Rectangle Rounded` | Squircle |
| `Oblong` | Oblong |
| `Round` | Round |
| `Square` | Square |
| `Rectangle` | Rectangle |
| `acap####`, `Overacap####`, outros | Custom |

Linhas com `Flashes = 0` são ignoradas (não existem aberturas no stencil).

## Testes

```bash
node tests/engine.test.mjs
```

Compara a saída do motor com os **exports reais** do Power BI de 5 relatórios
(ST42340, ST42341, ST42389, ST42419, ST42437) — 196 aberturas, linha a linha:
forma, area ratio, aspect ratio, volume e quantidade, além dos KPIs e do
formato do CSV. Hoje: **1023 verificações, 0 falhas**. O CI roda isso antes
de publicar.

### Sobre 4 divergências conhecidas

Em `ST42419` (D-codes 236/237) e `ST42437` (D-codes 89/90) os CSVs de
referência foram exportados de uma **revisão anterior** dos `.rpt`
(ex.: `130.9233` onde o `.rpt` atual traz `130.9237`). Alimentando as fórmulas
com as dimensões do próprio CSV, o resultado bate **bit a bit** — ou seja, a
diferença está nos dados antigos, não no cálculo. O teste cobre esse caso
explicitamente.

## Publicação (GitHub Pages)

1. Crie um repositório e envie estes arquivos:
   ```bash
   git init
   git add .
   git commit -m "Stencil Design Report"
   git branch -M main
   git remote add origin https://github.com/<usuario>/<repo>.git
   git push -u origin main
   ```
2. No GitHub: **Settings → Pages → Source: GitHub Actions**.
3. O workflow `.github/workflows/pages.yml` roda os testes e publica.
   O endereço fica `https://<usuario>.github.io/<repo>/`.

Para uso local, sem publicar:

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```
> Precisa de um servidor HTTP (mesmo local) porque o app usa módulos ES —
> abrir o `index.html` por `file://` não funciona.

## Estrutura

```
index.html                  interface (upload, opções, prévia)
src/engine.js               parser do .rpt + fórmulas IPC  ← núcleo verificado
src/format.js               formatação pt-BR e geração do CSV
src/gauge.js                velocímetros IPC em SVG
src/report.js               montagem das páginas do relatório
src/report.css              layouts fiel e moderno (1280×720)
src/app.js                  orquestração, PDF e downloads
assets/                     logo, QR code e figura IPC 3-17
vendor/                     html2canvas + jsPDF (locais, sem CDN)
tests/engine.test.mjs       regressão contra os exports do Power BI
tests/fixtures/             .rpt e CSVs de referência
```

## Limitações

- **K1/K2 e imagens de keep-out** não existem dentro do `.rpt` — são informados
  manualmente na interface quando há step.
- O PDF é gerado por captura das páginas (html2canvas + jsPDF), então o texto
  não é selecionável. Em troca, o resultado é idêntico ao que aparece na tela.
- A data no relatório é a data de geração (igual ao comportamento do Power BI).
