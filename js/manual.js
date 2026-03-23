(function () {
  'use strict';

  var pageTopBtn = document.getElementById('page-top-btn');

  window.addEventListener('scroll', function () {
    if (window.scrollY > 200) {
      pageTopBtn.classList.add('visible');
    } else {
      pageTopBtn.classList.remove('visible');
    }
  });

  pageTopBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}());
