const fs = require('fs');
fetch('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Digital%20Marketing&location=Ahmedabad&start=0')
  .then(r=>r.text())
  .then(html => {
    const jobCards = html.split('<div class="base-card').slice(1);
    const results = [];
    for (const card of jobCards) {
      const titleMatch = card.match(/<h3 class="base-search-card__title">\s*(.*?)\s*<\/h3>/is);
      const companyMatch = card.match(/<h4 class="base-search-card__subtitle">\s*<a[^>]*>\s*(.*?)\s*<\/a>/is) || card.match(/<h4 class="base-search-card__subtitle">\s*(.*?)\s*<\/h4>/is);
      const locationMatch = card.match(/<span class="job-search-card__location">\s*(.*?)\s*<\/span>/is);
      if (titleMatch && companyMatch && locationMatch) {
        results.push({ title: titleMatch[1].trim(), company: companyMatch[1].trim(), loc: locationMatch[1].trim() });
      }
    }
    console.log(results.slice(0, 5));
  })
