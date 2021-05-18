import {Request, Response} from "express";

export const newVar = async (req: Request, res: Response) => {
    console.log(JSON.stringify(req.body))
    const name = req.body.name;
    const branch = "test"// await createGitHubBranch(req.session.access_token, "https://api.github.com/XtraSonic/privateGit", name, "master")// todo
    res.send("Branch created ?" + JSON.stringify(branch))
};
