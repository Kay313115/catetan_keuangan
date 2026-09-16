document.addEventListener('DOMContentLoaded', () => {
  // --- SETUP DASAR ---
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'dompet_v3_data'; // kunci localStorage
  const state = { transactions: [], chartInstance: null };
  let currentPage = 1;
  const perPage = 7; // UDAH GUE SET 7 BIAR SESUAI MAU LU

  // --- FUNGSI KEAMANAN (RAPET ANTI-HACKER) ---

  // 1. Anti XSS: biar orang gak bisa inject <script> di kolom keterangan
  function escapeHTML(str){
    return String(str).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // 2. Format Rupiah: 10000 jadi Rp 10.000
  function formatCurrency(v){
    return 'Rp ' + Number(v).toLocaleString('id-ID');
  }

  // 3. Load Data Aman: cek data di HP, kalau rusak / diacak hacker auto reset
  function loadData(){
    try{
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if(!Array.isArray(raw)) throw 0;
      state.transactions = raw.filter(t =>
        t && typeof t.id==='number' &&
        typeof t.amount==='number' && t.amount>0 && t.amount<1000000000000 &&
        (t.type==='income'||t.type==='expense')
      );
    }catch{
      state.transactions = [];
    }
  }

  // 4. Simpan Data ke HP
  function persist(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
  }

  // --- FUNGSI TRANSAKSI ---

  // 5. Tambah Transaksi Baru
  function addTransaction(){
    const date = $('inputDate').value;
    const rawDesc = $('inputDesc').value.trim();
    const type = $('inputType').value;
    const amount = Number($('inputAmount').value);

    // Validasi ketat biar gak ada celah
    if(!date ||!rawDesc) return alert('Lengkapi dulu!');
    if(!Number.isFinite(amount) || amount<=0 || amount>1000000000000) return alert('Nominal tidak valid!');
    if(rawDesc.length>50) return alert('Keterangan max 50 huruf!');
    if(!['income','expense'].includes(type)) return alert('Tipe tidak valid!');

    const safeDesc = escapeHTML(rawDesc); // amankan deskripsi
    state.transactions.push({
      id: Date.now(),
      date,
      desc: safeDesc,
      type,
      amount: Math.floor(amount)
    });

    persist();
    $('inputDesc').value='';
    $('inputAmount').value='';
    render(); // refresh tampilan
  }

  // 6. Hapus Transaksi
  function deleteTransaction(id){
    state.transactions = state.transactions.filter(t=>t.id!==id);
    persist();
    render();
  }

  // --- FUNGSI RENDER / TAMPILAN ---

  // 7. Render Ringkasan Atas (Pemasukan, Pengeluaran, Saldo) - TETEP TOTAL SEMUA BULAN
  function renderSummary(){
    let inc=0,exp=0;
    state.transactions.forEach(t=>t.type==='income'?inc+=t.amount:exp+=t.amount);
    $('totalIncome').textContent=formatCurrency(inc);
    $('totalExpense').textContent=formatCurrency(exp);
    $('totalBalance').textContent=formatCurrency(inc-exp);
  }

  // 8. Render Tabel Riwayat + Filter Bulan + Pagination
  function renderTable(){
    const tbody=$('transactionList');
    if(!tbody) return;

    const monthVal=$('filterMonth').value;
    let filtered=[...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));

    // Filter bulan cuma ngaruh di riwayat
    if(monthVal!=='all') filtered=filtered.filter(t=>t.date.slice(0,7)===monthVal);

    // Isi dropdown bulan otomatis
    const months=[...new Set(state.transactions.map(t=>t.date.slice(0,7)))].sort().reverse();
    const sel=$('filterMonth');
    if(sel.options.length<=1){
      sel.innerHTML='<option value="all">Semua Bulan</option>';
      months.forEach(m=>{
        const o=document.createElement('option');
        o.value=m; o.textContent=m;
        sel.appendChild(o);
      });
      sel.value=monthVal;
    }

    // Logic pagination (7 data per halaman)
    const totalPages=Math.max(1,Math.ceil(filtered.length/perPage));
    if(currentPage>totalPages) currentPage=totalPages;
    const paged=filtered.slice((currentPage-1)*perPage, currentPage*perPage);

    tbody.innerHTML='';
    paged.forEach(t=>{
      const tr=document.createElement('tr');
      const tdDate=document.createElement('td'); tdDate.textContent=t.date.slice(5);
      const tdDesc=document.createElement('td'); tdDesc.innerHTML=t.desc;
      const tdIn=document.createElement('td'); tdIn.style.color='#00b894'; tdIn.textContent=t.type==='income'?formatCurrency(t.amount):'';
      const tdOut=document.createElement('td'); tdOut.style.color='#d63031'; tdOut.textContent=t.type==='expense'?formatCurrency(t.amount):'';
      const tdAct=document.createElement('td'); tdAct.innerHTML=`<button class="del-btn" data-id="${t.id}">Hapus</button>`;
      tr.append(tdDate,tdDesc,tdIn,tdOut,tdAct);
      tbody.appendChild(tr);
    });

    $('pageInfo').textContent=`${filtered.length} data • Hal ${currentPage}/${totalPages}`;
    $('prevPage').disabled=currentPage===1;
    $('nextPage').disabled=currentPage===totalPages;

    // Tombol hapus
    tbody.querySelectorAll('.del-btn').forEach(b=>b.addEventListener('click',e=>deleteTransaction(Number(e.target.dataset.id))));
  }

  // 9. Render Grafik Bulanan (Udah anti tower)
  function renderChart(){
    try{
      const canvas=$('monthlyChart');
      if(!canvas||typeof Chart==='undefined') return;
      const map={};
      state.transactions.forEach(t=>{
        const m=t.date.slice(0,7);
        if(!map[m]) map[m]={income:0,expense:0};
        map[m][t.type]+=t.amount;
      });
      const labels=Object.keys(map).sort();
      if(state.chartInstance) state.chartInstance.destroy();
      state.chartInstance=new Chart(canvas,{
        type:'bar',
        data:{
          labels,
          datasets:[
            {label:'Masuk',data:labels.map(l=>map[l].income),backgroundColor:'#00b894'},
            {label:'Keluar',data:labels.map(l=>map[l].expense),backgroundColor:'#d63031'}
          ]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false, // KUNCI BIAR GAK TOWER
          plugins:{legend:{position:'bottom'}}
        }
      });
    }catch(e){}
  }

  // 10. Render Semua Sekaligus
  function render(){
    renderSummary();
    renderTable();
    renderChart();
  }

  // 11. Init Aplikasi (jalan pas web dibuka)
  function init(){
    loadData();
    $('inputDate').valueAsDate=new Date();
    $('btnSave').addEventListener('click', addTransaction);
    $('filterMonth').addEventListener('change',()=>{ currentPage=1; renderTable(); });
    $('prevPage').addEventListener('click',()=>{ if(currentPage>1){ currentPage--; renderTable(); }});
    $('nextPage').addEventListener('click',()=>{ currentPage++; renderTable(); });
    render();
  }

  init();
});