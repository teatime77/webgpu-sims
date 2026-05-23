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
    collection, addDoc, query, where, orderBy, limit, getDocs
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject, getStorage } from "firebase/storage";
import * as firebaseui from "firebaseui";
import "firebaseui/dist/firebaseui.css";
import { bootstrap } from "./main";
import { $, $btn, $div, $dlg, $inp, hideHtml, MyError, showHtml } from "./utils";
import { msg } from "./primitive";
import { initArticle } from "./article";
import { testTagInput } from "./TagInput";
import { initSyntaxHighlightEditor } from "./editor";

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

const registerBtn = $btn("registerBtn");
const publicIdInput = $inp("publicIdInput");
const errorMsg = $div("error-msg");

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
    let publicId;
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

$btn("headerLoginBtn").addEventListener("click", () => {
    // ログイン画面（FirebaseUI表示状態）へ遷移させる処理
    // 例: navigateTo("SHOW_LOGIN");
    showView(loginView);
});

// 投稿ボタンのイベントリスナー
$btn("headerPostBtn").addEventListener("click", async() => {
    // 投稿画面への遷移処理など
    msg("投稿画面へ移動");
    showView(editView);
    await bootstrap();
    initSyntaxHighlightEditor("schema-editor");
    initSyntaxHighlightEditor("wgsl-editor");
});

$btn("articleBtn").addEventListener("click", ()=>{
    showView(articleView);
    testTagInput();
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
  thumbnailCanvas: HTMLCanvasElement; // Canvas要素を受け取る
  contentText: string;                // アプリ内のテキストデータを受け取る
  parentId: string | null;
  treePath: string[];
}

/**
 * CanvasからBlobを生成するヘルパー関数
 */
const getCanvasBlob = (canvas: HTMLCanvasElement, mimeType = "image/jpeg", quality = 0.8): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvasから画像の生成に失敗しました。"));
        }
      },
      mimeType,
      quality
    );
  });
};

export async function createArticle(params: CreateArticleParams): Promise<string> {
  const {
    authorId,
    title,
    tags,
    thumbnailCanvas,
    contentText,
    parentId,
    treePath,
  } = params;

  // アップロード成功後に保持しておくStorageの参照（ロールバック用）
  const uploadedRefs: ReturnType<typeof ref>[] = [];

  try {
    const timestamp = Date.now();

    // 1. Canvasから画像Blobを生成し、Cloud Storage にアップロード
    const thumbnailBlob = await getCanvasBlob(thumbnailCanvas, "image/jpeg", 0.8);
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
      thumbnailUrl,
      contentFileUrl,
      likeCount: 0,
      parentId,
      treePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "articles"), articleData);
    return docRef.id;

  } catch (error) {
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
export async function fetchLatestArticlesByKeyword(searchTag: string): Promise<ArticleData[]>{
  try {
    const articlesRef = collection(db, "articles");

    // クエリの構築
    const q = query(
      articlesRef,
      where("tags", "array-contains", searchTag), // 配列内にキーワードが含まれるか
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

initArticle();