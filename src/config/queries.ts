import type { QueryConfig } from "../types";

const queryConfig: QueryConfig = {
  fmkorea: [
    {
      label: "정수기 렌탈",
      searchUrl:
        "https://www.fmkorea.com/search.php?act=IS&is_keyword=%EC%A0%95%EC%88%98%EA%B8%B0+%EB%A0%8C%ED%83%88&mid=home&where=document&sph_sort=relevance",
    },
    {
      label: "비데 렌탈",
      searchUrl:
        "https://www.fmkorea.com/search.php?mid=home&act=IS&is_keyword=%EB%B9%84%EB%8D%B0+%EB%A0%8C%ED%83%88&where=document&sph_sort=relevance",
    },
    {
      label: "공기청정기 렌탈",
      searchUrl:
        "https://www.fmkorea.com/search.php?mid=home&act=IS&where=document&sph_sort=relevance&search_target=&is_keyword=%EA%B3%B5%EA%B8%B0%EC%B2%AD%EC%A0%95%EA%B8%B0+%EB%A0%8C%ED%83%88",
    },
  ],
  clien: [
    {
      label: "정수기 렌탈",
      searchUrl:
        "https://www.clien.net/service/search?q=%EC%A0%95%EC%88%98%EA%B8%B0%20%EB%A0%8C%ED%83%88&sort=recency&boardCd=&isBoard=false",
    },
    {
      label: "비데 렌탈",
      searchUrl:
        "https://www.clien.net/service/search?q=%EB%B9%84%EB%8D%B0%20%EB%A0%8C%ED%83%88&sort=recency&boardCd=&isBoard=false",
    },
    {
      label: "공기청정기 렌탈",
      searchUrl:
        "https://www.clien.net/service/search?q=%EA%B3%B5%EA%B8%B0%EC%B2%AD%EC%A0%95%EA%B8%B0%20%EB%A0%8C%ED%83%88&sort=recency&boardCd=&isBoard=false",
    },
  ],
  arca: [
    {
      label: "정수기 렌탈",
      searchUrl:
        "https://arca.live/b/breaking?keyword=%EC%A0%95%EC%88%98%EA%B8%B0+%EB%A0%8C%ED%83%88",
    },
  ],
  dcinside: [
    {
      label: "정수기 렌탈",
      searchUrl:
        "https://search.dcinside.com/post/sort/latest/q/.EC.A0.95.EC.88.98.EA.B8.B0.20.EB.A0.8C.ED.83.88",
    },
    {
      label: "비데 렌탈",
      searchUrl:
        "https://search.dcinside.com/post/sort/latest/q/.EB.B9.84.EB.8D.B0.20.EB.A0.8C.ED.83.88",
    },
    {
      label: "공기청정기 렌탈",
      searchUrl:
        "https://search.dcinside.com/post/sort/latest/q/.EA.B3.B5.EA.B8.B0.EC.B2.AD.EC.A0.95.EA.B8.B0.20.EB.A0.8C.ED.83.88",
    },
  ],
};

export default queryConfig;
