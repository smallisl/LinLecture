// 서버 주소는 Mac의 Wi-Fi IP가 바뀔 때마다 달라진다.
// 프로젝트 루트에 .env 파일을 만들고 EXPO_PUBLIC_SERVER_URL=http://<Mac IP>:3000 으로 지정하면
// 코드를 고치지 않고 바꿀 수 있다. (.env 는 .gitignore 에 포함되어 있음)
export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://172.31.213.218:3000';

export const STORAGE_KEY = '@LinLecture:lectures';
