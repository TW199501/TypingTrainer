using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// The dictionary words the app ships with, copied from <c>DICTIONARY</c> in
/// <c>apps/src/api/mock/fixtures.ts</c>. Mastery is not seeded: it is per user.
/// </summary>
public static class WordSeeds
{
    private sealed record Entry(string Text, string Phonetic, string Pos, string Zh, string Topic, string Example);

    private static readonly Entry[] Entries =
    [
        new("exchange rate", "/ɪksˈtʃeɪndʒ reɪt/", "n.", "匯率", "Banking", "The exchange rate today is lower than the rate we locked last week."),
        new("interest rate", "/ˈɪntrəst reɪt/", "n.", "利率", "Banking", "The central bank kept the interest rate unchanged this quarter."),
        new("remittance", "/rɪˈmɪtns/", "n.", "匯款", "Banking", "Please keep the remittance slip until the transfer is confirmed."),
        new("balance", "/ˈbæləns/", "n.", "餘額", "Banking", "Check the balance of your savings account before you apply."),
        new("reconcile", "/ˈrekənsaɪl/", "v.", "對帳", "Accounting", "The accountant will reconcile the invoice with the monthly statement."),
        new("depreciation", "/dɪˌpriːʃiˈeɪʃn/", "n.", "折舊", "Accounting", "Depreciation is recorded on a straight line basis over five years."),
        new("receivable", "/rɪˈsiːvəbl/", "n.", "應收帳款", "Accounting", "Accounts receivable rose slightly because of the new payment terms."),
        new("deployment", "/dɪˈplɔɪmənt/", "n.", "部署", "IT", "The deployment failed because the migration script timed out."),
        new("latency", "/ˈleɪtnsi/", "n.", "延遲", "IT", "Average latency dropped to forty milliseconds after the cache change."),
        new("rollback", "/ˈrəʊlbæk/", "n.", "還原", "IT", "We prepared a rollback plan in case the release breaks checkout."),
        new("agenda", "/əˈdʒendə/", "n.", "議程", "Meetings", "Please send the agenda and the meeting notes before Friday."),
        new("follow-up", "/ˈfɒləʊ ʌp/", "n.", "後續追蹤", "Meetings", "I will schedule a follow-up with the vendor next Tuesday."),
        new("appointment", "/əˈpɔɪntmənt/", "n.", "預約", "Daily life", "I made an appointment with the dentist for Monday morning."),
        new("receipt", "/rɪˈsiːt/", "n.", "收據", "Daily life", "Keep the receipt in case you want to return the jacket."),
    ];

    /// <summary>Inserts the words that are missing, matched on Text ignoring case and Topic exactly.</summary>
    public static void Seed(ISqlSugarClient db)
    {
        var existing = db.Queryable<Word>().ToList()
            .Select(w => Key(w.Text, w.Topic))
            .ToHashSet();

        foreach (var entry in Entries)
        {
            if (!existing.Add(Key(entry.Text, entry.Topic)))
            {
                continue;
            }

            var id = db.Insertable(new Word
            {
                Text = entry.Text,
                Phonetic = entry.Phonetic,
                Pos = entry.Pos,
                Zh = entry.Zh,
                Topic = entry.Topic,
            }).ExecuteReturnIdentity();
            db.Insertable(new WordExample { WordId = id, Sentence = entry.Example }).ExecuteCommand();
        }
    }

    private static string Key(string text, string? topic) =>
        text.ToLowerInvariant() + "\u001F" + (topic ?? "");
}
