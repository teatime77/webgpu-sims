import { initializeApp, type FirebaseApp } from "firebase/app";
import {
    getAuth,
    GoogleAuthProvider,
    EmailAuthProvider,
    onAuthStateChanged,
    type User,
    signOut,
    type Auth
} from "firebase/auth";
import {
    getFirestore,
    doc,
    getDoc,
    runTransaction,
    serverTimestamp,
    collection, addDoc, query, where, orderBy, limit, getDocs,
    setDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject, getStorage } from "firebase/storage";
import * as firebaseui from "firebaseui";
import "firebaseui/dist/firebaseui.css";
import { bootstrap } from "./main";
import { msg, range, assert, $, $btn, $div, $dlg, $inp, downloadMarkdownFile, hideHtml, MyError, showHtml, fetchText, $txt } from "./utils";
import { initArticle, makeArticleData, makeContentText, updatePreview } from "./article";
import { initTagInput, theTagInput } from "./TagInput";
import { initSyntaxHighlightEditor } from "./editor";

export let captureThumbnailFlag = false;
export let thumbnailBlob : Blob;

// -------------------------------------------------------------
// 1. Firebase 初期化
// -------------------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyAXx3bVV-cJLR5FFg3xsb6BHK9U7ufMnag",
    authDomain: "gpusims.firebaseapp.com",
    projectId: "gpusims",
    storageBucket: "gpusims.firebasestorage.app",
    messagingSenderId: "351327742687",
    appId: "1:351327742687:web:e76c82c1accf432428976a",
    measurementId: "G-C81XLP99XH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
export const storage = getStorage(app);

let theUser : User | null = null;
let publicId : string | null;

let theArticles : ArticleData[] = [];
let docId : string | undefined;

const registerBtn = $btn("registerBtn");
const publicIdInput = $inp("publicIdInput");
const errorMsg = $div("error-msg");

export function getPublicId() : string {
    assert(publicId != null);
    return publicId!;
}

function showMsg(text: string){
    errorMsg.textContent = text;
    setTimeout(()=>{

    }, 1000)
}

let loginView!: HTMLDivElement;
let mainView!: HTMLDivElement;
let editView!: HTMLDivElement;
let userView!: HTMLDivElement;
let articleView!: HTMLDivElement;

function hideAll(){
    [loginView, mainView, editView, userView, articleView].forEach(x => x.style.display = "none");
}

function showView(view: HTMLDivElement){
    hideAll();
    view.style.display = "grid";
}

// -------------------------------------------------------------
// 3. 認証状態の監視 (Single Source of Truth)
// -------------------------------------------------------------
onAuthStateChanged(auth, async (user: User | null) => {

    theUser = user;
    publicId = null;
    if (user) {
        showView(mainView);
        try {
            msg(`Firebase Auth ログイン成功! UID:${user.uid}`);

            // ★ 1. Firestore からデータを取得（ここでエラーが起きやすいです）
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            // ★ 2. 取得に成功したら画面を切り替える
            if(userSnap.exists()){
                publicId = userSnap.data().publicId;
            }

            if (publicId) {

            } 
            else {
            }
        } 
        catch (error) {
            // ★ 3. エラーが発生した場合、原因を画面に赤く表示する
            console.error("Firestoreでエラーが発生しました:", error);
        }
    } 
    else {
        // 未ログイン時はログイン画面を表示
        startFirebaseUI();
    }

    if (user) {
        // 【A】 サインイン済みの場合
        hideHtml($("headerLoginBtn"));
        showHtml($("logged-in"));
        if(publicId){

            $("headerUserId").textContent = publicId;
        }
        else{
            hideHtml($("headerUserId"));
        }
    } 
    else {
        // 【B】 サインインしていない（または初期設定前）の場合

        showHtml($("headerLoginBtn"));
        hideHtml($("logged-in"));
    }
});

// -------------------------------------------------------------
// 4. FirebaseUI の起動
// -------------------------------------------------------------
function startFirebaseUI() {
    const ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);

    ui.start("#firebaseui-auth-container", {
        // ★ 追加：サインインフローをポップアップ方式に強制する
        signInFlow: 'popup',

        signInOptions: [
            GoogleAuthProvider.PROVIDER_ID,
            EmailAuthProvider.PROVIDER_ID,
        ],
        callbacks: {
            // ログイン成功時に自動リダイレクトするのを防ぐ
            signInSuccessWithAuthResult: () => false
        }
    });
}

async function onRegisterBtn(){
    if(theUser == null){
        throw new MyError();
    }

    const desiredId = publicIdInput.value.trim();
    if (!desiredId) {
        showMsg("IDを入力してください。");
        return;
    }

    registerBtn.disabled = true;
    showMsg("登録中...");

    const profileRef = doc(db, "profiles", desiredId);
    const userRef = doc(db, "users", theUser.uid);

    try {
        await runTransaction(db, async (transaction) => {
            if(theUser == null){
                throw new MyError();
            }

            const profileDoc = await transaction.get(profileRef);

            if (profileDoc.exists()) {
                throw new Error("ID_ALREADY_TAKEN");
            }

            // 新規登録 (displayName はGoogleアカウント名などを初期値に使用)
            transaction.set(profileRef, {
                displayName: theUser.displayName || "名無しユーザー",
                iconUrl: theUser.photoURL || "",
                createdAt: serverTimestamp()
            });

            transaction.set(userRef, {
                publicId: desiredId,
                email: theUser.email || ""
            });
        });

        // トランザクション成功：
        // Firestoreの更新後、状態をMAIN_APPへ移行
    } catch (error: any) {
        registerBtn.disabled = false;
        if (error.message === "ID_ALREADY_TAKEN") {
            showMsg("このIDは既に使用されています。別のIDを指定してください。");
        } 
        else {
            showMsg("エラーが発生しました。もう一度お試しください。");
            console.error("Transaction failed: ", error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    msg("DOM Content Loaded");

    loginView = $div("login-view");
    mainView = $div("main-view");
    editView = $div("edit-view");
    userView = $div("user-view");
    articleView = $div("article-view")

    showView(mainView);
});

// --- 1. 画面の描画関数 ---
// URL（パス）に応じてDOMを書き換える
async function renderPage(path: string) {
    if (path === '/' || path === '/home') {
        docId = undefined;
        showView(mainView);
    } 
    else if (path.startsWith("/post/")) {
        showView(editView);
        const texts = path.split("/");
        assert(texts.length == 3);
        const idx = parseInt(texts[2]);
        assert(!(isNaN(idx)) && 0 <= idx && idx < theArticles.length)
        // msg(`post:${texts}`);
        const article = theArticles[idx];
        docId = article.id;
        const contentText = await fetchText(article.contentFileUrl);
        const lines = contentText.replaceAll("\r", "").split("\n");
        const startJsonet = lines.findIndex(x => x.startsWith("<!-- START OF SCHEMA."));
        const endJsonet = lines.findIndex((x, i) => startJsonet < i && x == "```");

        const startWgsl   = lines.findIndex(x => x.startsWith("<!-- START OF WGSL."));
        const endWgsl     = lines.findIndex((x, i) => startWgsl < i && x == "```");

        assert(startJsonet != -1 && startJsonet < endJsonet && endJsonet < startWgsl && startWgsl < endWgsl);
        assert(lines[startJsonet + 1] == "```jsonet" && lines[startWgsl + 1] == "```wgsl")
        const jsonText = lines.slice(startJsonet + 2, endJsonet).join("\n");
        const wgslText   = lines.slice(startWgsl   + 2, endWgsl).join("\n");

        // msg(`schema:${jsonet}`);
        // msg(`wgsl:${wgsl}`);

        $inp("title").value = article.title;

        theTagInput.clearTags();
        article.tags.forEach(x => theTagInput.addTag(x));

        $txt("markdown-text").value = lines.slice(0, startJsonet).join("\n");
        updatePreview();

        await bootstrap(jsonText, wgslText);
        initSyntaxHighlightEditor("schema-editor");
        initSyntaxHighlightEditor("wgsl-editor");
    }
}

// --- 2. 画面遷移の処理（履歴の追加） ---
function navigateTo(path: string) {
    // 第1引数: 保存したい状態(state)
    // 第2引数: タイトル(現在はほとんどのブラウザで無視されるため空文字でOK)
    // 第3引数: 新しいURLパス
    window.history.pushState({ path }, '', path);

    // URLが変わったので画面を再描画する
    renderPage(path);
}

// --- 3. 「戻る」「進む」ボタンの検知 ---
window.addEventListener('popstate', (event: PopStateEvent) => {
    // pushStateで保存した state オブジェクトを取得
    const state = event.state;

    // stateが存在すればそのパスを、なければ現在のURLのパスを再描画する
    const currentPath = state?.path || window.location.pathname;
    renderPage(currentPath);
});

// --- 4. 初回読み込み時の設定 ---
window.addEventListener('DOMContentLoaded', () => {
    const initialPath = window.location.pathname;

    // 初期表示のURLもHistory APIのstateに登録しておく（最初に戻ってきた時用）
    window.history.replaceState({ path: initialPath }, '', initialPath);

    // 初期画面を描画
    renderPage(initialPath);
});

$btn("headerLoginBtn").addEventListener("click", () => {
    // ログイン画面（FirebaseUI表示状態）へ遷移させる処理
    // 例: navigateTo("SHOW_LOGIN");
    showView(loginView);
});

// 投稿ボタンのイベントリスナー
$btn("headerPostBtn").addEventListener("click", async() => {
    // 投稿画面への遷移処理など
    msg("投稿画面へ移動");
    navigateTo('/post');
});

$btn("download-btn").addEventListener("click", ()=>{
    const contentText = makeContentText();
    const fileName = downloadMarkdownFile(contentText)
    msg(`save:${fileName}`);
});

$btn("publish-btn").addEventListener("click", async()=>{
    const params = makeArticleData();
    await createArticle(params);
});

$btn("thumbnail-btn").addEventListener("click", ()=>{
    captureThumbnailFlag = true;
});

export function captureThumbnail(){
    captureThumbnailFlag = false;

    const canvas = $("main-canvas") as HTMLCanvasElement;

    // 2. Create a temporary 2D canvas
    // const tempCanvas = $("temp-canvas") as HTMLCanvasElement
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    if(ctx == null){
        throw new MyError();
    }

    // 3. Draw the WebGPU canvas onto the 2D canvas immediately
    ctx.drawImage(canvas, 0, 0);

    // 4. Capture the image from the 2D canvas
    tempCanvas.toBlob((blob) => {
        if(blob == null){
            throw new MyError();
        }
        thumbnailBlob = blob;

        const imageUrl = URL.createObjectURL(blob);
        const img = $("thumbnail-img") as HTMLImageElement;

        // 1. Clean up the old blob URL if one exists
        if (img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }

        img.src = imageUrl;
    }, 'image/png');

}

$btn("add-details").addEventListener("click", ()=>{
    showView(articleView);
});

// ログアウトボタンのイベントリスナー
document.getElementById("headerLogoutBtn")?.addEventListener("click", () => {
    // Firebase Authのログアウト処理を呼び出す
    import("firebase/auth").then(({ getAuth, signOut }) => {
        signOut(getAuth());
    });
});

registerBtn.addEventListener("click", () => onRegisterBtn());


export interface CreateArticleParams {
  authorId: string;
  title: string;
  tags: string[];
  contentText: string;                // アプリ内のテキストデータを受け取る
}


export async function createArticle(params: CreateArticleParams): Promise<string> {
  const {
    authorId,
    title,
    tags,
    contentText,
  } = params;

  // アップロード成功後に保持しておくStorageの参照（ロールバック用）
  const uploadedRefs: ReturnType<typeof ref>[] = [];

  try {
    const timestamp = Date.now();

    // 1. Canvasから画像Blobを生成し、Cloud Storage にアップロード
    const thumbnailPath = `thumbnails/${authorId}/${timestamp}_thumbnail.jpg`;
    const thumbnailRef = ref(storage, thumbnailPath);
    
    await uploadBytes(thumbnailRef, thumbnailBlob);
    uploadedRefs.push(thumbnailRef); // 成功したらロールバック対象に追加
    const thumbnailUrl = await getDownloadURL(thumbnailRef);

    // 2. テキストデータからBlobを生成し、Cloud Storage にアップロード
    // 拡張子は .txt や独自のもの（.note など）適宜変更してください
    const contentBlob = new Blob([contentText], { type: "text/plain;charset=utf-8" });
    const contentPath = `contents/${authorId}/${timestamp}_content.txt`;
    const contentRef = ref(storage, contentPath);
    
    await uploadBytes(contentRef, contentBlob);
    uploadedRefs.push(contentRef); // 成功したらロールバック対象に追加
    const contentFileUrl = await getDownloadURL(contentRef);

    // 3. Firestore に記事データを保存
    const articleData = {
      authorId,
      title,
      tags,
      thumbnailPath,
      thumbnailUrl,
      contentPath,
      contentFileUrl,
      likeCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if(docId == undefined){

        const docRef = await addDoc(collection(db, "articles"), articleData);

        msg(`create Article OK`);
        return docRef.id;
    }
    else{
        const docRef = doc(db, "articles", docId);        
        await setDoc(docRef, articleData);

        msg(`update Article OK`);
        return docRef.id;
    }
  } 
  catch (error) {
    console.error("記事の投稿中にエラーが発生しました:", error);

    // 【疑似ロールバック】Firestoreの保存に失敗した場合、アップロード済みのファイルを削除
    if (uploadedRefs.length > 0) {
      console.log("アップロードされたファイルのロールバック（削除）を試みます...");
      // deleteObject を並列で実行し、エラーが起きても握りつぶす（本処理のエラーを優先するため）
      await Promise.allSettled(
        uploadedRefs.map((storageRef) => deleteObject(storageRef))
      );
      console.log("ロールバックが完了しました。");
    }

    throw new Error("記事の投稿に失敗しました。");
  }
}

// 取得する記事データの型定義（必要に応じて拡張してください）
export interface ArticleData {
  id: string;
  authorId: string;
  title: string;
  tags: string[];
  thumbnailUrl: string;
  contentFileUrl: string;
  likeCount: number;
  parentId: string | null;
  treePath: string[];
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

/**
 * カテゴリーとキーワードで記事を検索し、最新20件を取得する
 * @param searchTag 検索する単語（完全一致）
 * @returns 検索結果の記事配列
 */
export async function fetchLatestArticlesByKeyword(): Promise<ArticleData[]>{
    // searchTag: string
  try {
    const articlesRef = collection(db, "articles");

    // クエリの構築
    const q = query(
      articlesRef,
    //   where("tags", "array-contains", searchTag), // 配列内にキーワードが含まれるか
      orderBy("updatedAt", "desc"),                   // 更新日時の降順
      limit(20)                                       // 20件取得
    );

    const querySnapshot = await getDocs(q);

    // 取得したドキュメントを配列にマッピング
    const articles: ArticleData[] = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ArticleData, "id">)
    }));

    return articles;

  } catch (error) {
    console.error("記事の検索中にエラーが発生しました:", error);
    throw new Error("記事の取得に失敗しました。");
  }
};

async function getContents(){
    theArticles = await fetchLatestArticlesByKeyword();

    const div = $div("articles");
    for(const [idx, doc] of theArticles.entries()){
        msg(`doc: ${doc.authorId} ${doc.title} ${doc.thumbnailUrl}`);

        const box = document.createElement("div");
        box.className = "box";

        box.addEventListener("click", (ev:PointerEvent)=>{
            navigateTo(`/post/${idx}`);
        });

        const img = document.createElement("img");
        img.className = "box-thumbnail";
        img.src = doc.thumbnailUrl!;

        box.appendChild(img);

        const title = document.createElement("span");
        title.textContent = doc.title;

        box.appendChild(title);

        const user = document.createElement("span");
        user.textContent = doc.authorId;

        box.appendChild(user);

        div.appendChild(box);
    }
}

initArticle();
initTagInput();
await getContents();