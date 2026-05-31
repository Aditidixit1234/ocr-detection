document.addEventListener("DOMContentLoaded", function () {

  console.log("JS LOADED ✅");

  // =========================
  // AUTH CHECK
  // =========================
  const userStr = localStorage.getItem("user");
  if (!userStr) {
    window.location.href = "login.html";
    return;
  }
  const currentUser = JSON.parse(userStr);
  const db = firebase.firestore();

  // =========================
  // ELEMENTS
  // =========================
  const uploadZone  = document.getElementById('upload-zone');
  const fileInput   = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const previewImg  = document.getElementById('preview-img');
  const analyzeBtn  = document.getElementById('analyze-btn');
  const errorBox    = document.getElementById('error-box');
  const errorMsg    = document.getElementById('error-msg');
  const loading     = document.getElementById('loading');
  const results     = document.getElementById('results');
  const resetBtn    = document.getElementById('reset-btn');
  const progressBar = document.getElementById('progress-bar');
  const thinkMsg    = document.getElementById('think-msg');

  let selectedFile = null;
  let progressInt  = null;
  let thinkInt     = null;
  let batchFiles   = [];
  let batchIndex   = 0;

  const thinkTexts = [
    'VisionAPI is thinking...',
    'EasyOCR is processing...',
    'Extracting text...',
    'TrOCR is analyzing...',
    'Correcting errors...',
    'Almost done...'
  ];

  // =========================
  // HIGHLIGHT DIFFERENCES
  // =========================
  function highlightDifferences(raw, clean) {
    if (!raw || !clean) return clean;
    const rawWords   = raw.split(" ");
    const cleanWords = clean.split(" ");
    return cleanWords.map((word, i) => {
      if (word !== rawWords[i]) {
        return `<span class="diff-word">${word}</span>`;
      }
      return word;
    }).join(" ");
  }

  // =========================
  // UPLOAD ZONE CLICK
  // =========================
  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', function (e) {
      if (e.target === fileInput) return;
      fileInput.click();
    });
  }

  // =========================
  // DRAG & DROP
  // =========================
  if (uploadZone) {
    uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', function (e) {
      e.stopPropagation();
      uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFile(file);
      } else {
        showError("Please upload a valid image file.");
      }
    });
  }

  // =========================
  // FILE INPUT (main)
  // =========================
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      e.stopPropagation();
      if (fileInput.files && fileInput.files[0]) {
        handleFile(fileInput.files[0]);
      }
    });
  }

  // =========================
  // PDF INPUT
  // =========================
  const pdfInput = document.getElementById('pdf-input');
  if (pdfInput) {
    pdfInput.addEventListener('change', function () {
      const file = pdfInput.files[0];
      if (!file) return;
      if (file.type !== 'application/pdf') {
        showError('Please upload a valid PDF file.');
        return;
      }
      handleFile(file);

      // Show PDF preview label
      if (previewWrap) {
        previewWrap.style.display = 'block';
        previewImg.style.display = 'none';
        let pdfLabel = document.getElementById('pdf-preview-label');
        if (!pdfLabel) {
          pdfLabel = document.createElement('div');
          pdfLabel.id = 'pdf-preview-label';
          pdfLabel.style.cssText = 'padding:20px;text-align:center;font-size:0.9rem;color:rgba(196,181,253,0.7);';
          previewWrap.appendChild(pdfLabel);
        }
        pdfLabel.textContent = '📄 ' + file.name + ' — PDF ready to analyze';
      }
    });
  }

  // =========================
  // BATCH INPUT
  // =========================
  const batchInput = document.getElementById('batch-input');
  if (batchInput) {
    batchInput.addEventListener('change', function () {
      const files = Array.from(batchInput.files);
      if (!files.length) return;

      batchFiles = files.filter(f => f.type.startsWith('image/'));
      batchIndex = 0;

      if (batchFiles.length === 0) {
        showError('No valid image files found in batch.');
        return;
      }

      // Show batch info
      if (previewWrap) previewWrap.style.display = 'block';
      let batchLabel = document.getElementById('batch-label');
      if (!batchLabel) {
        batchLabel = document.createElement('div');
        batchLabel.id = 'batch-label';
        batchLabel.style.cssText = 'padding:14px 18px;background:rgba(99,102,241,0.1);border-radius:10px;margin-top:10px;font-size:0.85rem;color:rgba(196,181,253,0.8);border:1px solid rgba(99,102,241,0.2);';
        previewWrap.parentNode.insertBefore(batchLabel, previewWrap.nextSibling);
      }
      batchLabel.innerHTML = `📦 <strong>${batchFiles.length} images</strong> ready for batch processing`;

      // Load first file preview
      handleFile(batchFiles[0]);
    });
  }

  // =========================
  // HANDLE FILE
  // =========================
  function handleFile(file) {
    selectedFile = file;
    hideError();
    hideResults();

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function (e) {
        if (previewImg) {
          previewImg.src = e.target.result;
          previewImg.style.display = 'block';
        }
        if (previewWrap) previewWrap.style.display = 'block';
        if (analyzeBtn)  analyzeBtn.style.display  = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      // PDF
      if (analyzeBtn) analyzeBtn.style.display = 'block';
    }
  }

  // =========================
  // ANALYZE
  // =========================
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async function () {

      if (!selectedFile && batchFiles.length === 0) {
        showError("Please upload an image first.");
        return;
      }

      // If batch mode
      if (batchFiles.length > 1) {
        await processBatch();
        return;
      }

      await processFile(selectedFile);
    });
  }

  // =========================
  // PROCESS SINGLE FILE
  // =========================
  async function processFile(file) {
    if (loading)  loading.style.display  = "block";
    if (resetBtn) resetBtn.style.display = "none";
    analyzeBtn.disabled = true;
    hideError();
    hideResults();

    let pct = 0;
    if (progressBar) progressBar.style.width = '0%';
    progressInt = setInterval(function () {
      pct = Math.min(pct + Math.random() * 7, 88);
      if (progressBar) progressBar.style.width = pct + '%';
    }, 300);

    let ti = 0;
    if (thinkMsg) thinkMsg.textContent = thinkTexts[0];
    thinkInt = setInterval(function () {
      ti = (ti + 1) % thinkTexts.length;
      if (thinkMsg) thinkMsg.textContent = thinkTexts[ti];
    }, 2000);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://127.0.0.1:8000/process", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Server error ${res.status}`);
      }

      const data = await res.json();
      console.log("Backend response:", data);

      fillResults(data);

      // Save to Firestore
      db.collection("ocr_results").add({
        user_id:    currentUser.uid,
        raw:        data.raw_text     || "",
        clean:      data.cleaned_text || "",
        summary:    data.insights     || "",
        confidence: data.confidence   || 0,
        filename:   file.name         || "unknown",
        created_at: new Date()
      }).then(function () {
        loadHistory();
      }).catch(function (err) {
        console.warn("Firestore save error:", err);
      });

      if (progressBar) progressBar.style.width = '100%';

      setTimeout(function () {
        if (loading)  loading.style.display  = "none";
        if (results)  results.style.display  = "block";
        if (resetBtn) resetBtn.style.display = "flex";
        const dlWrap = document.querySelector('.download-actions');
        if (dlWrap) dlWrap.style.display = "flex";
      }, 400);

    } catch (err) {
      console.error("Fetch error:", err);
      if (loading) loading.style.display = "none";
      if (err.message.includes('fetch') || err.message.includes('Failed')) {
        showError("⚠ Backend not running. Start: uvicorn main:app --reload");
      } else {
        showError(err.message);
      }
      analyzeBtn.disabled = false;
    } finally {
      clearInterval(progressInt);
      clearInterval(thinkInt);
      analyzeBtn.disabled = false;
    }
  }

  // =========================
  // PROCESS BATCH
  // =========================
  async function processBatch() {
    const batchResults = document.getElementById('batch-results') || createBatchResultsContainer();

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];

      if (thinkMsg) thinkMsg.textContent = `Processing image ${i + 1} of ${batchFiles.length}...`;
      if (loading)  loading.style.display = 'block';
      analyzeBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("http://127.0.0.1:8000/process", {
          method: "POST",
          body: formData
        });

        const data = await res.json();

        // Add result card
        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:16px;margin-top:12px;';
        card.innerHTML = `
          <div style="font-size:0.75rem;color:#a78bfa;font-family:'DM Mono',monospace;margin-bottom:8px;">
            📄 ${file.name} — ${(data.confidence * 100).toFixed(1)}% confidence
          </div>
          <p style="font-size:0.85rem;color:rgba(255,255,255,0.8);line-height:1.6;margin:0;">
            ${data.cleaned_text || data.raw_text || '(no data)'}
          </p>
        `;
        batchResults.appendChild(card);

        // Save each to Firestore
        db.collection("ocr_results").add({
          user_id:    currentUser.uid,
          raw:        data.raw_text     || "",
          clean:      data.cleaned_text || "",
          summary:    data.insights     || "",
          confidence: data.confidence   || 0,
          filename:   file.name         || "unknown",
          created_at: new Date()
        }).catch(err => console.warn(err));

      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
        const errCard = document.createElement('div');
        errCard.style.cssText = 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:12px;margin-top:8px;color:#f87171;font-size:0.82rem;';
        errCard.textContent = `❌ Failed: ${file.name}`;
        batchResults.appendChild(errCard);
      }
    }

    if (loading) loading.style.display = 'none';
    analyzeBtn.disabled = false;
    batchFiles = [];
    loadHistory();
  }

  function createBatchResultsContainer() {
    let container = document.getElementById('batch-results');
    if (container) return container;
    container = document.createElement('div');
    container.id = 'batch-results';
    container.style.cssText = 'margin-top:20px;';
    const title = document.createElement('h3');
    title.style.cssText = 'font-size:1rem;font-weight:600;margin-bottom:4px;color:#e0e0ff;';
    title.textContent = 'Batch Results';
    container.appendChild(title);
    document.querySelector('.inner').appendChild(container);
    return container;
  }

  // =========================
  // FILL RESULTS
  // =========================
  function fillResults(data) {
    const rawEl     = document.getElementById('raw-text');
    const cleanEl   = document.getElementById('clean-text');
    const summaryEl = document.getElementById('summary-text');

    if (rawEl)     rawEl.textContent  = data.raw_text    || "(no data)";
    if (cleanEl)   cleanEl.innerHTML  = highlightDifferences(data.raw_text, data.cleaned_text) || "(no data)";
    if (summaryEl) summaryEl.textContent = data.insights || "(no data)";

    const confBar = document.getElementById('confidence-bar');
    const confVal = document.getElementById('confidence-value');
    const confSrc = document.getElementById('confidence-source');
    const confBox = document.getElementById('confidence-box');

    if (data.confidence !== undefined) {
      const pctStr = (data.confidence * 100).toFixed(1) + '%';
      if (confBar) confBar.style.width = pctStr;
      if (confVal) confVal.textContent = pctStr;
      if (confSrc) confSrc.textContent = 'Source: ' + (data.ocr_source || '');
      if (confBox) confBox.classList.add('show');
    }

    const comp       = document.querySelector('.comparison-section');
    const easyText   = document.getElementById("easy-text");
    const trocrText  = document.getElementById("trocr-text");
    const visionText = document.getElementById("vision-text");
    const easyConf   = document.getElementById("easy-conf");
    const trocrConf  = document.getElementById("trocr-conf");

    if (easyText)   easyText.textContent   = data.easy_text  || "--";
    if (trocrText)  trocrText.textContent  = data.trocr_text || "--";
    if (visionText) visionText.textContent = data.vision_text || "Analyzed";

    if (easyConf) easyConf.textContent = data.easy_conf !== undefined
      ? (data.easy_conf * 100).toFixed(1) + '%' : "--";
    if (trocrConf) trocrConf.textContent = data.trocr_conf !== undefined
      ? (data.trocr_conf * 100).toFixed(1) + '%' : "--";

    if (comp) comp.style.display = "block";

    const easyConfVal   = data.easy_conf  || 0;
    const trocrConfVal  = data.trocr_conf || 0;
    const visionConfVal = 0.86;

    document.getElementById('easy-card')?.classList.remove('best');
    document.getElementById('trocr-card')?.classList.remove('best');
    document.getElementById('vision-card')?.classList.remove('best');

    if (trocrConfVal >= easyConfVal && trocrConfVal >= visionConfVal) {
      document.getElementById('trocr-card')?.classList.add('best');
    } else if (easyConfVal >= trocrConfVal && easyConfVal >= visionConfVal) {
      document.getElementById('easy-card')?.classList.add('best');
    } else {
      document.getElementById('vision-card')?.classList.add('best');
    }
  }

  // =========================
  // COPY BUTTONS
  // =========================
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const el = document.getElementById(targetId);
      if (!el) return;
      const text = el.innerText || el.textContent || '';
      navigator.clipboard.writeText(text).then(function () {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(function () { btn.textContent = orig; }, 1400);
      });
    });
  });

  // =========================
  // DOWNLOAD TXT
  // =========================
  const downloadTxt = document.getElementById("download-txt");
  if (downloadTxt) {
    downloadTxt.addEventListener("click", function () {
      const rawText     = document.getElementById("raw-text")?.innerText     || "";
      const cleanText   = document.getElementById("clean-text")?.innerText   || "";
      const summaryText = document.getElementById("summary-text")?.innerText || "";
      const content = `OCR STUDIO — RESULTS\n${"=".repeat(40)}\n\nRAW OCR:\n${rawText}\n\nCLEANED TEXT:\n${cleanText}\n\nSUMMARY:\n${summaryText}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "ocr-result.txt";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // =========================
  // DOWNLOAD PDF
  // =========================
  const downloadPdf = document.getElementById("download-pdf");
  if (downloadPdf) {
    downloadPdf.addEventListener("click", function () {
      const rawText     = document.getElementById("raw-text")?.innerText     || "";
      const cleanText   = document.getElementById("clean-text")?.innerText   || "";
      const summaryText = document.getElementById("summary-text")?.innerText || "";
      const win = window.open("", "_blank", "width=800,height=600");
      win.document.write(`
        <!DOCTYPE html><html>
        <head><title>OCR Result</title>
        <style>
          body{font-family:Arial,sans-serif;padding:40px;color:#111;}
          h1{color:#6366f1;border-bottom:2px solid #6366f1;padding-bottom:10px;}
          h2{color:#7c3aed;margin-top:30px;}
          p{line-height:1.8;font-size:14px;}
          .section{margin-bottom:30px;background:#f9f9f9;padding:16px;border-radius:8px;}
        </style></head>
        <body>
          <h1>OCR Studio — Result</h1>
          <div class="section"><h2>Raw OCR Text</h2><p>${rawText.replace(/\n/g,'<br>')}</p></div>
          <div class="section"><h2>Cleaned Text</h2><p>${cleanText.replace(/\n/g,'<br>')}</p></div>
          <div class="section"><h2>Summary</h2><p>${summaryText.replace(/\n/g,'<br>')}</p></div>
        </body></html>
      `);
      win.document.close();
      setTimeout(function () { win.print(); }, 500);
    });
  }

  // =========================
  // SEARCH HISTORY
  // =========================
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", async function () {
      const query    = searchInput.value.toLowerCase();
      const container = document.getElementById("search-results");
      if (!container) return;
      container.innerHTML = "";
      if (!query) return;

      try {
        const snapshot = await db.collection("ocr_results")
          .where("user_id", "==", currentUser.uid)
          .orderBy("created_at", "desc")
          .get();

        snapshot.forEach(function (doc) {
          const d = doc.data();
          if (d.clean && d.clean.toLowerCase().includes(query)) {
            const div = document.createElement("div");
            div.style.cssText = "padding:12px 14px;margin-top:8px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.18);border-radius:10px;font-size:0.85rem;color:rgba(255,255,255,0.8);line-height:1.6;";
            div.innerHTML = `
              <div style="font-size:0.7rem;color:#a78bfa;font-family:'DM Mono',monospace;margin-bottom:6px;">
                ${d.filename || 'unknown'} · ${d.confidence ? (d.confidence * 100).toFixed(1) + '%' : ''} · ${d.created_at?.toDate ? d.created_at.toDate().toLocaleDateString() : ''}
              </div>
              <div>${d.clean}</div>
            `;
            container.appendChild(div);
          }
        });

        if (container.children.length === 0) {
          container.innerHTML = '<p style="font-size:0.8rem;color:rgba(255,255,255,0.25);margin-top:8px;">No results found.</p>';
        }
      } catch (err) {
        console.error("Search error:", err);
      }
    });
  }

  // =========================
  // HISTORY DASHBOARD
  // =========================
  async function loadHistory() {
    const historyGrid = document.getElementById('history-grid');
    if (!historyGrid) return;

    historyGrid.innerHTML = '<p style="font-size:0.8rem;color:rgba(255,255,255,0.25);">Loading...</p>';

    try {
      const snapshot = await db.collection("ocr_results")
        .where("user_id", "==", currentUser.uid)
        .orderBy("created_at", "desc")
        .limit(10)
        .get();

      if (snapshot.empty) {
        historyGrid.innerHTML = '<p style="font-size:0.8rem;color:rgba(255,255,255,0.25);">No history yet. Analyze an image to get started.</p>';
        return;
      }

      historyGrid.innerHTML = '';

      snapshot.forEach(function (doc) {
        const d = doc.data();
        const date = d.created_at?.toDate ? d.created_at.toDate().toLocaleDateString() : 'Unknown date';
        const conf = d.confidence ? (d.confidence * 100).toFixed(1) + '%' : '--';
        const preview = d.clean ? d.clean.substring(0, 100) + (d.clean.length > 100 ? '...' : '') : '(no text)';

        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(99,102,241,0.15);border-radius:12px;padding:14px 16px;margin-top:10px;transition:all 0.2s;cursor:pointer;';

        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:0.72rem;font-family:'DM Mono',monospace;color:#a78bfa;">
              📄 ${d.filename || 'image'}
            </span>
            <div style="display:flex;gap:10px;align-items:center;">
              <span style="font-size:0.7rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.25);border-radius:20px;padding:2px 10px;color:#c4b5fd;">
                ${conf}
              </span>
              <span style="font-size:0.7rem;color:rgba(255,255,255,0.25);font-family:'DM Mono',monospace;">
                ${date}
              </span>
            </div>
          </div>
          <p style="font-size:0.83rem;color:rgba(255,255,255,0.65);line-height:1.6;margin:0;">
            ${preview}
          </p>
        `;

        card.addEventListener('mouseenter', function () {
          card.style.borderColor = 'rgba(168,85,247,0.4)';
          card.style.background  = 'rgba(99,102,241,0.08)';
        });

        card.addEventListener('mouseleave', function () {
          card.style.borderColor = 'rgba(99,102,241,0.15)';
          card.style.background  = 'rgba(255,255,255,0.04)';
        });

        // Click to load result back
        card.addEventListener('click', function () {
          const rawEl     = document.getElementById('raw-text');
          const cleanEl   = document.getElementById('clean-text');
          const summaryEl = document.getElementById('summary-text');
          if (rawEl)     rawEl.textContent     = d.raw   || "(no data)";
          if (cleanEl)   cleanEl.textContent   = d.clean || "(no data)";
          if (summaryEl) summaryEl.textContent = d.summary || "(no data)";
          if (results)   results.style.display = 'block';
          results.scrollIntoView({ behavior: 'smooth' });
        });

        historyGrid.appendChild(card);
      });

    } catch (err) {
      console.error("History load error:", err);
      historyGrid.innerHTML = '<p style="font-size:0.8rem;color:#f87171;">Failed to load history. Make sure Firestore indexes are set up.</p>';
    }
  }

  // Load history on page load
  loadHistory();

  // =========================
  // RESET
  // =========================
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      selectedFile = null;
      batchFiles   = [];
      if (fileInput)   fileInput.value           = '';
      if (previewImg)  previewImg.src            = '';
      if (previewImg)  previewImg.style.display  = 'block';
      if (previewWrap) previewWrap.style.display = 'none';
      if (analyzeBtn)  analyzeBtn.style.display  = 'none';

      const dlWrap = document.querySelector('.download-actions');
      if (dlWrap) dlWrap.style.display = 'none';

      const comp = document.querySelector('.comparison-section');
      if (comp) comp.style.display = 'none';

      const confBox = document.getElementById('confidence-box');
      if (confBox) confBox.classList.remove('show');

      const batchLabel = document.getElementById('batch-label');
      if (batchLabel) batchLabel.remove();

      const batchResults = document.getElementById('batch-results');
      if (batchResults) batchResults.innerHTML = '';

      const pdfLabel = document.getElementById('pdf-preview-label');
      if (pdfLabel) pdfLabel.remove();

      hideError();
      hideResults();
    });
  }

  // =========================
  // LOGOUT
  // =========================
  window.logout = function () {
    firebase.auth().signOut().then(function () {
      localStorage.removeItem("user");
      window.location.href = "login.html";
    });
  };

  // =========================
  // HELPERS
  // =========================
  function showError(msg) {
    if (errorMsg) errorMsg.textContent   = msg;
    if (errorBox) errorBox.style.display = 'flex';
  }

  function hideError() {
    if (errorBox) errorBox.style.display = 'none';
  }

  function hideResults() {
    if (results)  results.style.display  = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
  }

});